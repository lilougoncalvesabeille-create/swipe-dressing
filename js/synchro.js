// Synchronisation avec le dépôt privé du récolteur, par l'API REST de GitHub.
// Module pur (sans DOM) : `fetch` est injecté, utilisable dans le navigateur et dans Node.
//
// La clé GitHub n'apparaît que dans l'en-tête `Authorization` : jamais dans une URL, un corps de
// requête, un message d'erreur ou un journal.

import { echauffementFait, compacterSwipes } from './paquet.js';

export const DEPOT = 'lilougoncalvesabeille-create/swipe-dressing-donnees';
const URL_DEPOT = `https://api.github.com/repos/${DEPOT}`;
const ACCEPT_JSON = 'application/vnd.github+json';
const ACCEPT_BRUT = 'application/vnd.github.raw+json';

export const FICHIERS = {
  pile: 'pile.json',
  profil: 'profil.json',
  swipes: 'swipes.json',
  annonces: 'annonces-etat.json',
  recolte: 'recolte.json',
};

const SENS = ['droite', 'gauche'];
const UN_JOUR = 24 * 60 * 60 * 1000;

// --- Erreurs typées (messages en français, sans la clé, sans l'erreur d'origine) ---

export class ErreurSynchro extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}
/** La clé est refusée (401) ou n'a pas les droits sur le dépôt (403, 404 en écriture). */
export class ErreurCle extends ErreurSynchro {}
/** Le fichier a changé depuis sa lecture (SHA périmé : 409 ou 422). */
export class ErreurConflit extends ErreurSynchro {}
/** Réseau coupé, GitHub indisponible ou limite de requêtes atteinte. */
export class ErreurReseau extends ErreurSynchro {}

// --- Base64 UTF-8 ---

function texteVersBase64(texte) {
  const octets = new TextEncoder().encode(texte);
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64VersTexte(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(octets);
}

function jsonOuNull(texte) {
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
}

// --- Client de l'API ---

/**
 * creerClient({cle, fetch}) → { lire(nom), ecrire(nom, objet, sha, message), tester() }
 * - lire : {json, sha} ; null si le fichier n'existe pas (404) ; json null si le contenu est illisible.
 * - ecrire : {sha} du nouveau contenu ; ErreurConflit si `sha` n'est plus le bon.
 * - tester : {ok, raison: 'ok'|'cle'|'acces'|'reseau'|'github', message} ; ne lève jamais d'erreur.
 */
export function creerClient({ cle, fetch: f = globalThis.fetch?.bind(globalThis) } = {}) {
  const entetes = (accept) => ({ Authorization: `Bearer ${cle}`, Accept: accept });
  const urlFichier = (nom) => `${URL_DEPOT}/contents/${String(nom).split('/').map(encodeURIComponent).join('/')}`;

  async function requete(url, init, quoi) {
    try {
      // no-store : jamais de copie des données privées dans le cache HTTP du navigateur.
      return await f(url, { ...init, cache: 'no-store' });
    } catch {
      // L'erreur d'origine n'est pas gardée : elle pourrait citer les en-têtes.
      throw new ErreurReseau(`GitHub injoignable (${quoi})`);
    }
  }

  function verifier(r, quoi) {
    if (r.status === 401) throw new ErreurCle(`Clé GitHub refusée (${quoi})`);
    if (r.status === 403 || r.status === 429) {
      if (r.status === 429 || limiteDeRequetes(r)) {
        throw new ErreurReseau(`Limite de requêtes GitHub atteinte, réessai plus tard (${quoi})`);
      }
      throw new ErreurCle(`La clé GitHub n'a pas les droits sur le dépôt de données (${quoi})`);
    }
    if (!r.ok) throw new ErreurReseau(`Erreur GitHub ${r.status} (${quoi})`);
  }

  // 403 temporaire : limite principale (x-ratelimit-remaining: 0) ou secondaire (retry-after).
  function limiteDeRequetes(r) {
    return r.headers?.get?.('x-ratelimit-remaining') === '0' || r.headers?.get?.('retry-after') != null;
  }

  async function corpsJson(r, quoi) {
    try {
      return await r.json();
    } catch {
      throw new ErreurReseau(`Réponse de GitHub illisible (${quoi})`);
    }
  }

  async function lire(nom) {
    const url = urlFichier(nom);
    const r = await requete(url, { headers: entetes(ACCEPT_JSON) }, nom);
    if (r.status === 404) return null;
    verifier(r, nom);
    const corps = await corpsJson(r, nom);
    const sha = typeof corps?.sha === 'string' ? corps.sha : null;
    if (typeof corps?.content === 'string' && corps.content.length > 0 && corps.encoding !== 'none') {
      let texte;
      try {
        texte = base64VersTexte(corps.content);
      } catch {
        return { json: null, sha };
      }
      return { json: jsonOuNull(texte), sha };
    }
    // Fichier de plus de 1 Mo : l'API ne donne pas le contenu, on le redemande en brut.
    const brut = await requete(url, { headers: entetes(ACCEPT_BRUT) }, nom);
    if (brut.status === 404) return null;
    verifier(brut, nom);
    let texte;
    try {
      texte = await brut.text();
    } catch {
      throw new ErreurReseau(`Réponse de GitHub illisible (${nom})`);
    }
    return { json: jsonOuNull(texte), sha };
  }

  async function ecrire(nom, objet, sha, message) {
    const corps = { message, content: texteVersBase64(JSON.stringify(objet)) };
    if (sha) corps.sha = sha;
    const r = await requete(urlFichier(nom), {
      method: 'PUT',
      headers: { ...entetes(ACCEPT_JSON), 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    }, nom);
    if (r.status === 409 || r.status === 422) throw new ErreurConflit(`${nom} a changé entre-temps`);
    if (r.status === 404) throw new ErreurCle(`La clé GitHub n'a pas accès au dépôt de données (${nom})`);
    verifier(r, nom);
    let reponse = null;
    try {
      reponse = await r.json();
    } catch {
      // Écriture faite ; seul le nouveau SHA manque (il sera relu au prochain envoi).
    }
    return { sha: reponse?.content?.sha ?? null };
  }

  async function tester() {
    let r;
    try {
      r = await f(URL_DEPOT, { headers: entetes(ACCEPT_JSON), cache: 'no-store' });
    } catch {
      return { ok: false, raison: 'reseau', message: 'Pas de connexion à GitHub : réessaie quand le téléphone est connecté.' };
    }
    if (r.ok) return { ok: true, raison: 'ok', message: 'Clé valide : le dépôt de données est accessible.' };
    if (r.status === 401) {
      return { ok: false, raison: 'cle', message: 'Clé refusée par GitHub : elle est mal copiée, invalide ou a expiré.' };
    }
    if (r.status === 429 || (r.status === 403 && limiteDeRequetes(r))) {
      return { ok: false, raison: 'reseau', message: 'Trop de requêtes vers GitHub : réessaie dans une heure.' };
    }
    if (r.status === 403 || r.status === 404) {
      return {
        ok: false,
        raison: 'acces',
        message: 'Cette clé n’a pas accès au dépôt swipe-dressing-donnees : '
          + 'il faut le droit « Contents : Read and write » sur ce dépôt.',
      };
    }
    return { ok: false, raison: 'github', message: `GitHub ne répond pas correctement (erreur ${r.status}) : réessaie plus tard.` };
  }

  return { lire, ecrire, tester };
}

// --- Format de swipes.json ---
// { "version": 1, "swipes": [{id, sens, t, raison?, repeche_le?}], "annules": [{id, t}],
//   "remis_a_zero": ISO|null, "echauffement_faits": int }

const estDemo = (id) => id.startsWith('demo:');
const texte = (v) => typeof v === 'string' && v.length > 0;
const swipeLisible = (s) => s !== null && typeof s === 'object' && texte(s.id) && SENS.includes(s.sens) && texte(s.t);
const annuleLisible = (a) => a !== null && typeof a === 'object' && texte(a.id) && texte(a.t);

function swipeCompact(s) {
  const r = { id: s.id, sens: s.sens, t: s.t };
  if (texte(s.raison)) r.raison = s.raison;
  if (texte(s.repeche_le)) r.repeche_le = s.repeche_le;
  return r;
}

/**
 * Swipes de l'appli (avec carte et empreinte) → objet swipes.json compact, sans la démo.
 * `plancherEchauffement` : dernière valeur de echauffement_faits lue dans le dépôt (depuis la
 * dernière remise à zéro). Les swipes importés d'ailleurs n'ont pas la marque d'échauffement : sans
 * ce plancher, le téléphone ferait baisser le compte du dépôt.
 */
export function versSwipesJson(swipes, annules = [], remisAZero = null, { plancherEchauffement = 0 } = {}) {
  const reels = (Array.isArray(swipes) ? swipes : []).filter((s) => swipeLisible(s) && !estDemo(s.id));
  return {
    version: 1,
    swipes: reels.map(swipeCompact),
    annules: (Array.isArray(annules) ? annules : [])
      .filter((a) => annuleLisible(a) && !estDemo(a.id))
      .map((a) => ({ id: a.id, t: a.t })),
    remis_a_zero: texte(remisAZero) ? remisAZero : null,
    echauffement_faits: Math.max(
      echauffementFait(reels),
      Number.isInteger(plancherEchauffement) && plancherEchauffement > 0 ? plancherEchauffement : 0,
    ),
  };
}

/** Lecture tolérante d'un objet swipes.json (entrées mal formées écartées). */
export function depuisSwipesJson(objet) {
  const o = objet !== null && typeof objet === 'object' && !Array.isArray(objet) ? objet : {};
  const n = o.echauffement_faits;
  return {
    swipes: (Array.isArray(o.swipes) ? o.swipes : []).filter(swipeLisible).map(swipeCompact),
    annules: (Array.isArray(o.annules) ? o.annules : []).filter(annuleLisible).map((a) => ({ id: a.id, t: a.t })),
    remisAZero: texte(o.remis_a_zero) ? o.remis_a_zero : null,
    echauffementFaits: Number.isInteger(n) && n >= 0 ? n : 0,
  };
}

// Date en millisecondes (-Infinity si absente ou illisible).
const ms = (iso) => {
  const v = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(v) ? v : -Infinity;
};
// Un swipe compte à sa date la plus récente : le swipe lui-même ou son repêchage.
const dateSwipe = (s) => Math.max(ms(s.t), ms(s.repeche_le));

function activite(cote) {
  let max = -Infinity;
  for (const s of cote.swipes) max = Math.max(max, dateSwipe(s));
  for (const a of cote.annules) max = Math.max(max, ms(a.t));
  return max;
}

/**
 * Fusionne la version locale de swipes.json avec la version distante :
 * - union des swipes par id, le plus récent (t ou repeche_le) gagnant (à égalité : le local) ;
 * - union des annulations, la plus récente par id ; un swipe annulé après sa date est retiré
 *   (un swipe refait après l'annulation reste) ;
 * - le remis_a_zero le plus récent gagne et masque tout ce qui lui est antérieur ;
 * - echauffement_faits vient du côté à l'activité la plus récente (0 si elle précède la remise à zéro).
 */
export function fusionnerDistant(local, distant) {
  const L = depuisSwipesJson(local);
  const D = depuisSwipesJson(distant);
  const remis = ms(D.remisAZero) > ms(L.remisAZero) ? D.remisAZero : L.remisAZero;
  const tRemis = ms(remis);

  const annules = new Map();
  for (const a of [...L.annules, ...D.annules]) {
    if (!annules.has(a.id) || ms(a.t) > ms(annules.get(a.id).t)) annules.set(a.id, a);
  }
  const parId = new Map();
  for (const s of [...L.swipes, ...D.swipes]) {
    if (!parId.has(s.id) || dateSwipe(s) > dateSwipe(parId.get(s.id))) parId.set(s.id, s);
  }
  const swipes = [...parId.values()]
    .filter((s) => {
      const date = dateSwipe(s);
      if (date <= tRemis) return false;
      const annule = annules.get(s.id);
      return !annule || ms(annule.t) < date;
    })
    .sort((a, b) => ms(a.t) - ms(b.t));

  const aL = activite(L);
  const aD = activite(D);
  const gagnant = aL >= aD ? L : D;
  const echauffement = Math.max(aL, aD) > tRemis ? gagnant.echauffementFaits : 0;

  return {
    version: 1,
    swipes,
    annules: [...annules.values()]
      .filter((a) => ms(a.t) > tRemis)
      .sort((a, b) => ms(a.t) - ms(b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    remis_a_zero: remis,
    echauffement_faits: echauffement,
  };
}

// --- Envois ---

/**
 * Envoie swipes.json : lire la version distante, fusionner, écrire avec le SHA lu.
 * Sur un conflit de version, on relit et on recommence (`essais` fois au plus).
 * Rien n'est écrit si la fusion ne change rien. Renvoie {envoye, objetFinal}.
 */
export async function envoyerSwipes(client, objetLocal, { essais = 3 } = {}) {
  let derniere = null;
  for (let i = 0; i < essais; i++) {
    const lu = await client.lire(FICHIERS.swipes);
    const objetFinal = fusionnerDistant(objetLocal, lu?.json ?? null);
    if (lu && lu.json !== null && JSON.stringify(objetFinal) === JSON.stringify(fusionnerDistant(lu.json, null))) {
      return { envoye: false, objetFinal };
    }
    try {
      await client.ecrire(FICHIERS.swipes, objetFinal, lu?.sha, 'Téléphone : swipes');
      return { envoye: true, objetFinal };
    } catch (e) {
      if (!(e instanceof ErreurConflit)) throw e;
      derniere = e;
    }
  }
  throw derniere ?? new ErreurConflit(`${FICHIERS.swipes} : aucun essai`);
}

/** Objet profil.json : { version: 1, profil, modifie_le }. */
export function versProfilJson(profil, modifieLe = new Date().toISOString()) {
  return { version: 1, profil, modifie_le: modifieLe };
}

/**
 * Envoie profil.json (le téléphone en est le seul auteur), sauf si la version distante est plus
 * récente (autre appareil) ou identique. Renvoie {envoye}.
 */
export async function envoyerProfil(client, objetProfil, { essais = 3 } = {}) {
  let derniere = null;
  for (let i = 0; i < essais; i++) {
    const lu = await client.lire(FICHIERS.profil);
    if (lu?.json && ms(lu.json.modifie_le) > ms(objetProfil.modifie_le)) return { envoye: false };
    if (lu?.json && JSON.stringify(lu.json) === JSON.stringify(objetProfil)) return { envoye: false };
    try {
      await client.ecrire(FICHIERS.profil, objetProfil, lu?.sha, 'Téléphone : profil');
      return { envoye: true };
    } catch (e) {
      if (!(e instanceof ErreurConflit)) throw e;
      derniere = e;
    }
  }
  throw derniere ?? new ErreurConflit(`${FICHIERS.profil} : aucun essai`);
}

// --- Retour vers le téléphone ---

/**
 * Ajoute aux swipes du téléphone ceux que swipes.json connaît en plus (faits sur un autre appareil,
 * ou perdus par ce téléphone) : en tête, sans carte ni empreinte, marqués `distant`. Leurs cartes ne
 * seront jamais remontrées. Un id annulé ici après la date de ce swipe n'est pas réimporté
 * (envoi parti juste avant l'annulation). Renvoie le même tableau si rien n'est ajouté.
 */
export function importerDistants(swipes, objetFinal, annules = []) {
  if (!objetFinal) return swipes;
  const vus = new Set(swipes.map((s) => s.id));
  const annulesIci = new Map((Array.isArray(annules) ? annules : []).filter(annuleLisible).map((a) => [a.id, ms(a.t)]));
  const nouveaux = depuisSwipesJson(objetFinal).swipes
    .filter((s) => !vus.has(s.id) && !((annulesIci.get(s.id) ?? -Infinity) >= dateSwipe(s)))
    .map((s) => ({ ...s, distant: true }));
  return nouveaux.length > 0 ? [...nouveaux, ...swipes] : swipes;
}

/**
 * Swipes à enregistrer après un envoi : ceux du stockage, précédés des swipes importés, puis
 * compactés. Les importés restent en tête : « annuler » et la raison du refus visent toujours le
 * dernier swipe fait sur ce téléphone. Renvoie le même tableau si rien n'est importé.
 */
export function swipesApresImport(stockes, objetFinal, annules = []) {
  const avec = importerDistants(stockes, objetFinal, annules);
  return avec === stockes ? stockes : compacterSwipes(avec);
}

/** Les 4 derniers caractères de la clé (pour la reconnaître dans Réglages), '' sinon. */
export function finDeCle(cle) {
  return typeof cle === 'string' && cle.length >= 8 ? cle.slice(-4) : '';
}

/**
 * recolte.json → faut-il un bandeau « récolte en retard » ? Oui si le dernier passage est
 * bloqué, en erreur, sans date lisible ou date de plus de 24 h. Sans recolte.json : non.
 */
export function recolteEnRetard(recolte, maintenant = new Date()) {
  if (!recolte || typeof recolte !== 'object') return false;
  if (recolte.statut === 'bloque' || recolte.statut === 'erreur') return true;
  const t = ms(recolte.dernier_passage);
  return !Number.isFinite(t) || maintenant.getTime() - t > UN_JOUR;
}
