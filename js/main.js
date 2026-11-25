// Branchement de l'appli : état, sauvegarde, chargement de la pile, synchronisation et navigation.

import {
  profilParDefaut, prochaines, swiper, annuler, ajouterRaison, echauffementFait, repecher,
  fusionnerSwipes, nettoyerSwipes, oublierDemo, compacterSwipes, majDispoFavoris, retirerIds,
} from './paquet.js';
import { creerStore } from './store.js';
import { chargerPile } from './pile.js';
import { viderCacheEmpreintes } from './empreintes.js';
import {
  creerClient, versSwipesJson, versProfilJson, envoyerSwipes, envoyerProfil, importerDistants,
  recolteEnRetard, FICHIERS, ErreurCle, ErreurReseau,
} from './synchro.js';
import { completerProfil } from './formulaire.js';
import { afficherEcran, majBandeauStockage } from './ecrans.js';
import { enregistrerServiceWorker } from './hors-connexion.js';
import './swipe-ui.js'; // enregistre l'écran « swipe »
import './listes-ui.js'; // enregistre les écrans « favoris », « historique » et « detail »

const CLE_PROFIL = 'sd:profil';
const CLE_SWIPES = 'sd:swipes';
// Clé GitHub : seulement ici (jamais dans une URL, un message, un journal ou une autre clé).
// « Tout effacer » la garde.
const CLE_GITHUB = 'sd:cle';
const CLE_ANNULES = 'sd:annules'; // [{id, t}] : annulations à faire connaître au dépôt privé
// {derniereLecture, dernierEnvoi, remisAZero, profilEnAttente, profilModifieLe, recolte}
const CLE_SYNCHRO = 'sd:synchro';
// {ids, avant} : cartes déjà vues avant « Tout effacer », écartées des piles générées avant cette date
const CLE_ECARTES = 'sd:ecartes';
const PREFIXE = 'sd:';
const URL_PILE = 'data/demo-pile.json';
const DELAI_ENVOI = 5000; // ms après le dernier swipe : les swipes rapprochés partent ensemble
const DELAI_RELECTURE = 60_000; // ms : au plus une relecture du dépôt par minute au retour sur l'appli
const MAX_ANNULES = 500;

// Seuls les échecs d'écriture du profil et des swipes affichent « Tes choix ne seront pas gardés »
// (une grosse pile refusée par le stockage n'empêche pas de garder les choix).
const nouveauStore = () => creerStore(undefined, { critiques: [CLE_SWIPES, CLE_PROFIL] });
let store = nouveauStore();

const pileVide = () => ({ cartes: [], echauffement: [], styles: [], erreurs: [] });

// Entrées mal formées écartées (stockage abîmé ou écrit par une ancienne version).
function lireSwipes() {
  return nettoyerSwipes(store.lire(CLE_SWIPES, []));
}

const lireProfil = () => completerProfil(store.lire(CLE_PROFIL, null));

function lireCle() {
  const cle = store.lire(CLE_GITHUB, null);
  return typeof cle === 'string' && cle.trim() ? cle.trim() : null;
}

const objetOuVide = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const lireEtatSynchro = () => objetOuVide(store.lire(CLE_SYNCHRO, null));
function ecrireEtatSynchro(changements) {
  const s = { ...lireEtatSynchro(), ...changements };
  store.ecrire(CLE_SYNCHRO, s);
  return s;
}

function lireAnnules() {
  const a = store.lire(CLE_ANNULES, []);
  return Array.isArray(a) ? a.filter((x) => typeof x?.id === 'string' && typeof x?.t === 'string') : [];
}

function etatSynchroInitial() {
  const s = lireEtatSynchro();
  return {
    // 'sans-cle' | 'pret' | 'en-cours' | 'ok' | 'hors-ligne' | 'cle-refusee' | 'erreur'
    statut: lireCle() ? 'pret' : 'sans-cle',
    derniereLecture: s.derniereLecture ?? null,
    dernierEnvoi: s.dernierEnvoi ?? null,
    recolte: s.recolte ?? null, // contenu de recolte.json (bandeau « récolte en retard »)
    erreur: null, // message en français, sans la clé
  };
}

// État de l'appli : la seule source de vérité. Les écrans le lisent par `donnees.etat`.
const etat = {
  profil: lireProfil(),
  swipes: lireSwipes(),
  pile: pileVide(),
  pileChargee: false,
  ecran: null,
  fiche: null, // {id, origine, defilement, jeton} : fiche détail ouverte
  carteDessus: null, // id de la carte visible sur le dessus de l'écran de swipe
  synchro: etatSynchroInitial(), // état de la synchronisation avec le dépôt privé (écran Réglages)
};

// Pile telle que chargée, avant d'en écarter les cartes déjà vues avant « Tout effacer ».
let pileBrute = pileVide();

// Changements voulus de cette copie de l'appli depuis sa dernière lecture ou écriture des swipes :
// ils gagnent sur le stockage lors de la fusion (voir fusionnerSwipes).
const session = { modifies: new Set(), supprimes: new Set() };

function majBandeau() {
  majBandeauStockage(store.persistant);
}

function sauverProfil() {
  store.ecrire(CLE_PROFIL, etat.profil);
  majBandeau();
  if (lireCle()) {
    ecrireEtatSynchro({ profilEnAttente: true, profilModifieLe: new Date().toISOString() });
    envoyerEnFond();
  }
}

/**
 * Enregistre les swipes. Une autre copie de l'appli (appli installée et onglet Chrome partagent
 * le stockage) a pu écrire entre-temps : on fusionne avec le stockage au lieu de l'écraser.
 * `modifies` : ids changés volontairement ici (swipe, raison, repêche) ;
 * `supprimes` : ids retirés ici (annuler, oubli de la démo).
 */
function sauverSwipes(swipes = etat.swipes, { modifies = [], supprimes = [] } = {}) {
  for (const id of modifies) {
    session.modifies.add(id);
    session.supprimes.delete(id);
  }
  for (const id of supprimes) {
    session.supprimes.add(id);
    session.modifies.delete(id);
  }
  // Compactage : les vieux refus perdent carte et empreinte (le stockage reste sous 2 Mo).
  etat.swipes = compacterSwipes(fusionnerSwipes(lireSwipes(), swipes, session));
  store.ecrire(CLE_SWIPES, etat.swipes);
  // Le stockage est maintenant à jour avec cette copie : plus rien à faire gagner.
  session.modifies.clear();
  session.supprimes.clear();
  majBandeau();
}

// Efface toutes les clés `sd:*` du stockage du navigateur (sauf la clé GitHub), puis repart d'un
// état neuf. Avec une clé, le dépôt privé est remis à zéro aussi (swipes.json et profil.json).
function toutEffacer() {
  const cle = lireCle();
  const maintenant = new Date().toISOString();
  // Les annonces déjà vues ne reviennent pas : elles restent écartées des piles déjà générées
  // (le récolteur, lui, ne les repropose plus).
  const dejaVues = etat.swipes.map((s) => s.id).filter((id) => !id.startsWith('demo:'));
  try {
    const stockage = globalThis.localStorage;
    const cles = [];
    for (let i = 0; i < stockage.length; i++) {
      const nom = stockage.key(i);
      if (nom?.startsWith(PREFIXE) && nom !== CLE_GITHUB) cles.push(nom);
    }
    for (const nom of cles) stockage.removeItem(nom);
  } catch {
    // Stockage indisponible : il n'y a rien sur le disque à effacer.
  }
  store = nouveauStore(); // oublie aussi les valeurs gardées en mémoire par l'ancien store
  if (cle && !lireCle()) store.ecrire(CLE_GITHUB, cle); // stockage indisponible : la clé reste en mémoire
  clearTimeout(minuteurEnvoi);
  minuteurEnvoi = null;
  generation++; // un envoi parti avant n'a plus le droit de toucher aux swipes
  envoiNecessaire = false;
  shaPile = null; // sd:pile est effacée : la prochaine lecture la réenregistre
  if (dejaVues.length > 0) {
    store.ecrire(CLE_ECARTES, { ids: dejaVues, avant: maintenant });
    etat.pile = ecarterDejaVues(pileBrute);
  }
  etat.profil = profilParDefaut();
  etat.swipes = [];
  etat.carteDessus = null;
  session.modifies.clear();
  session.supprimes.clear();
  majSynchro({ derniereLecture: null, dernierEnvoi: null, erreur: null });
  if (cle) {
    // Envoyé par le chemin normal : si le réseau manque, la remise à zéro part plus tard.
    ecrireEtatSynchro({ remisAZero: maintenant, profilEnAttente: true, profilModifieLe: maintenant });
    envoyerEnFond();
  }
  majBandeau();
  naviguer('questionnaire');
}

// --- Synchronisation avec le dépôt privé (js/synchro.js) ---
// Sans clé : mode démo, rien ne part. Avec clé : la pile vient de pile.json, les swipes partent
// DELAI_ENVOI après le dernier swipe (ou au retour du réseau, ou en passant en arrière-plan),
// le profil à chaque enregistrement.

let minuteurEnvoi = null;
let envoiNecessaire = false; // swipes changés ici et pas encore envoyés
let envoiEnCours = null;
let envoiARefaire = false;
let derniereLectureMs = 0;
let generation = 0; // change à « Tout effacer » : les réponses d'avant sont ignorées
let shaPile = null; // SHA de pile.json déjà installée (pas de nouveau calcul si elle n'a pas changé)

const client = () => {
  const cle = lireCle();
  return cle ? creerClient({ cle, fetch: (...args) => globalThis.fetch(...args) }) : null;
};

// Met à jour etat.synchro et prévient les écrans (événement « sd:synchro » sur window).
function majSynchro(changements) {
  Object.assign(etat.synchro, changements);
  try {
    window.dispatchEvent(new CustomEvent('sd:synchro'));
  } catch {
    // Pas de fenêtre : personne à prévenir.
  }
}

function noterErreur(e) {
  if (e instanceof ErreurCle) {
    majSynchro({ statut: 'cle-refusee', erreur: e.message });
  } else if (e instanceof ErreurReseau) {
    majSynchro({ statut: navigator.onLine === false ? 'hors-ligne' : 'erreur', erreur: e.message });
  } else {
    // Erreur inattendue : seul son nom est journalisé (jamais l'objet, qui pourrait citer une requête).
    console.error('Synchronisation impossible :', e?.name ?? 'erreur');
    majSynchro({ statut: 'erreur', erreur: 'Synchronisation impossible.' });
  }
}

async function tache(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

const objetSwipesLocal = () => versSwipesJson(etat.swipes, lireAnnules(), lireEtatSynchro().remisAZero ?? null);

// Les swipes que swipes.json connaît en plus (autre appareil, stockage perdu) sont ajoutés ici
// sans carte : ces annonces ne sont jamais remontrées.
function appliquerDistant(objetFinal) {
  const avec = importerDistants(etat.swipes, objetFinal, lireAnnules());
  if (avec === etat.swipes) return;
  const locaux = new Set(etat.swipes.map((s) => s.id));
  sauverSwipes(avec, { modifies: avec.filter((s) => !locaux.has(s.id)).map((s) => s.id) });
}

async function envoyerUneFois(c) {
  const gen = generation;
  const avant = lireEtatSynchro();
  if (avant.profilEnAttente) {
    const modifieLe = avant.profilModifieLe ?? new Date().toISOString();
    await envoyerProfil(c, versProfilJson(etat.profil, modifieLe));
    // Profil réenregistré pendant l'envoi : il repartira au prochain tour.
    if (lireEtatSynchro().profilModifieLe === avant.profilModifieLe) ecrireEtatSynchro({ profilEnAttente: false });
  }
  envoiNecessaire = false;
  try {
    const { objetFinal } = await envoyerSwipes(c, objetSwipesLocal());
    if (gen !== generation) return; // « Tout effacer » entre-temps : l'envoi suivant remet à zéro
    appliquerDistant(objetFinal);
  } catch (e) {
    if (gen === generation) envoiNecessaire = true;
    throw e;
  }
  const t = new Date().toISOString();
  ecrireEtatSynchro({ dernierEnvoi: t });
  majSynchro({ dernierEnvoi: t });
}

// Un seul envoi à la fois ; une demande pendant un envoi en relance un juste après.
function envoyer(c) {
  if (envoiEnCours) {
    envoiARefaire = true;
    return envoiEnCours;
  }
  envoiEnCours = (async () => {
    try {
      do {
        envoiARefaire = false;
        await envoyerUneFois(c);
      } while (envoiARefaire);
    } finally {
      envoiEnCours = null;
    }
  })();
  return envoiEnCours;
}

async function envoyerEnFond() {
  clearTimeout(minuteurEnvoi);
  minuteurEnvoi = null;
  const c = client();
  if (!c) return;
  majSynchro({ statut: 'en-cours' });
  const e = await tache(() => envoyer(c));
  if (e) noterErreur(e);
  else majSynchro({ statut: 'ok', erreur: null });
}

// Après un swipe (ou annuler, raison, repêche) : envoi regroupé DELAI_ENVOI après le dernier.
function programmerEnvoi() {
  if (!lireCle()) return;
  envoiNecessaire = true;
  clearTimeout(minuteurEnvoi);
  minuteurEnvoi = setTimeout(envoyerEnFond, DELAI_ENVOI);
}

function noterAnnule(id) {
  if (id.startsWith('demo:')) return;
  const annules = lireAnnules().filter((a) => a.id !== id);
  annules.push({ id, t: new Date().toISOString() });
  store.ecrire(CLE_ANNULES, annules.slice(-MAX_ANNULES));
}

// annonces-etat.json → « Plus dispo » sur les favoris ; recolte.json → bandeau de l'écran de swipe.
async function lireAnnexes(c) {
  const [annonces, recolte] = await Promise.all([c.lire(FICHIERS.annonces), c.lire(FICHIERS.recolte)]);
  if (annonces?.json && etat.swipes.length > 0) {
    const { swipes, modifies } = majDispoFavoris(etat.swipes, annonces.json);
    if (modifies.length > 0) {
      sauverSwipes(swipes, { modifies });
      if (etat.ecran === 'favoris' || etat.ecran === 'historique') redessiner();
    }
  }
  const json = recolte?.json;
  const valeur = json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  ecrireEtatSynchro({ recolte: valeur });
  majSynchro({ recolte: valeur });
}

// pile.json du dépôt privé (repli sur sd:pile, jamais sur la démo).
async function chargerPileDistante(c) {
  let lu = null;
  let erreur = null;
  try {
    lu = await c.lire(FICHIERS.pile);
  } catch (e) {
    erreur = e;
  }
  if (!erreur && lu?.sha && lu.sha === shaPile && etat.pileChargee) return; // pile inchangée
  const pile = await chargerPile(async () => {
    if (erreur) throw erreur;
    if (!lu) throw new Error('pile.json absent du dépôt : le PC n’a pas encore fait de récolte');
    if (lu.json === null) throw new Error('pile.json illisible');
    return lu.json;
  }, store, { sansDemo: true });
  if (!erreur) shaPile = lu?.sha ?? null;
  installerPile(pile);
  if (erreur) throw erreur;
}

/**
 * Lit le dépôt (pile, annonces, récolte : au plus une fois par DELAI_RELECTURE, sauf `forcer`)
 * et envoie ce qui attend (profil, swipes).
 */
async function synchroniser({ forcer = false } = {}) {
  const c = client();
  if (!c) return;
  const relire = forcer || Date.now() - derniereLectureMs >= DELAI_RELECTURE;
  if (relire) derniereLectureMs = Date.now();
  majSynchro({ statut: 'en-cours' });
  const [ePile, eAnnexes, eEnvoi] = await Promise.all([
    relire ? tache(() => chargerPileDistante(c)) : null,
    relire ? tache(() => lireAnnexes(c)) : null,
    tache(() => envoyer(c)),
  ]);
  if (relire && !ePile && !eAnnexes) {
    const t = new Date().toISOString();
    ecrireEtatSynchro({ derniereLecture: t });
    majSynchro({ derniereLecture: t });
  }
  const erreur = ePile ?? eAnnexes ?? eEnvoi;
  if (erreur) noterErreur(erreur);
  else majSynchro({ statut: 'ok', erreur: null });
}

// Actions de synchronisation pour les écrans (Réglages → « Synchronisation », bandeau de récolte).
const actionsSynchro = {
  cleEnregistree: () => lireCle() !== null,
  /** Teste puis enregistre la clé (gardée aussi sans réseau). Renvoie {ok, raison, message, enregistree}. */
  enregistrerCle: async (saisie) => {
    const cle = String(saisie ?? '').trim();
    if (!cle) return { ok: false, raison: 'cle', message: 'Colle d’abord la clé GitHub.', enregistree: false };
    if (/\s/.test(cle)) {
      return { ok: false, raison: 'cle', message: 'La clé ne doit contenir ni espace ni retour à la ligne.', enregistree: false };
    }
    const resultat = await creerClient({ cle, fetch: (...args) => globalThis.fetch(...args) }).tester();
    // Une clé refusée n'est pas gardée ; sans réseau, elle l'est (elle sera essayée plus tard).
    if (resultat.raison === 'cle' || resultat.raison === 'acces') return { ...resultat, enregistree: false };
    store.ecrire(CLE_GITHUB, cle);
    ecrireEtatSynchro({ profilEnAttente: true, profilModifieLe: new Date().toISOString() });
    shaPile = null;
    majSynchro({ statut: 'pret', erreur: null });
    synchroniser({ forcer: true });
    return { ...resultat, enregistree: true };
  },
  testerCle: async () => {
    const c = client();
    if (!c) return { ok: false, raison: 'cle', message: 'Aucune clé enregistrée.' };
    return c.tester();
  },
  /** Oublie la clé : retour au mode démo. */
  oublierCle: () => {
    clearTimeout(minuteurEnvoi);
    minuteurEnvoi = null;
    store.effacer(CLE_GITHUB);
    shaPile = null;
    majSynchro({ statut: 'sans-cle', erreur: null });
    chargerLaPile().catch((e) => console.error('Rechargement de la pile impossible', e?.name));
  },
  synchroniser: () => synchroniser({ forcer: true }),
  recolteEnRetard: () => lireCle() !== null && recolteEnRetard(etat.synchro.recolte),
};

// --- Fiche détail et geste « retour » du téléphone ---
// Ouvrir une fiche ajoute une entrée à l'historique du navigateur (pushState) : le geste
// « retour » d'Android (ou le bouton du navigateur) ramène alors à la liste d'origine.

let ignorerPopstate = false;
let retourEnCours = false; // history.back() demandé, popstate pas encore reçu (double tape sur « Retour »)

const ficheEnCours = () => etat.fiche && history.state?.sdFiche === etat.fiche.jeton;

function ouvrirFiche(id, origine) {
  const jeton = `${Date.now()}-${Math.random()}`;
  etat.fiche = { id, origine, defilement: window.scrollY, jeton };
  retourEnCours = false;
  try {
    history.pushState({ sdFiche: jeton }, '');
  } catch {
    // Historique indisponible : le bouton « ← Retour » suffit.
  }
  naviguer('detail');
}

function revenirDeFiche() {
  const { origine = 'favoris', defilement = 0 } = etat.fiche ?? {};
  naviguer(origine);
  window.scrollTo(0, defilement);
}

// Bouton « ← Retour » : passe par l'historique si la fiche y a son entrée (popstate s'en charge).
function fermerFiche() {
  if (retourEnCours) return; // une seule sortie, même si le bouton est touché deux fois
  if (ficheEnCours()) {
    retourEnCours = true;
    history.back();
  } else {
    revenirDeFiche();
  }
}

// La fiche est quittée autrement (barre de navigation) : retire son entrée de l'historique,
// sans que le popstate qui suit ne change d'écran.
function quitterFiche() {
  if (retourEnCours) {
    // Le retour déjà demandé retire l'entrée : son popstate ne doit plus changer d'écran.
    ignorerPopstate = true;
    return;
  }
  if (ficheEnCours()) {
    ignorerPopstate = true;
    retourEnCours = true;
    history.back();
  }
}

window.addEventListener('popstate', () => {
  retourEnCours = false;
  if (ignorerPopstate) {
    ignorerPopstate = false;
    return;
  }
  if (etat.ecran === 'detail') revenirDeFiche();
});

function auRepecher(id) {
  sauverSwipes(repecher(etat.swipes, id), { modifies: [id] });
  programmerEnvoi();
}

// La pile n'a pas pu être chargée du tout (ni réseau ni sauvegarde).
const pileIndisponible = () => etat.pileChargee && etat.pile.erreurs.length > 0
  && etat.pile.cartes.length === 0 && etat.pile.echauffement.length === 0;

// Données propres à chaque écran, en plus de `etat` et `naviguer` communs à tous.
const donneesPour = {
  // La suite des cartes n'est jamais gardée en cache : elle est recalculée à chaque appel
  // avec le profil et les swipes du moment (un changement de réglages s'applique tout de suite).
  swipe: () => ({
    chargee: etat.pileChargee,
    suivantes: () => prochaines(etat.pile, etat.profil, etat.swipes, Math.random),
    auSwipe: (entree, sens) => {
      const swipes = swiper(etat.swipes, entree.carte, sens, { echauffement: entree.echauffement });
      if (swipes !== etat.swipes) {
        sauverSwipes(swipes, { modifies: [entree.carte.id] });
        programmerEnvoi();
      }
    },
    auAnnuler: () => {
      const dernier = etat.swipes.at(-1) ?? null;
      if (dernier) {
        sauverSwipes(annuler(etat.swipes), { supprimes: [dernier.id] });
        // Le swipe a peut-être déjà été envoyé : l'annulation le retire aussi du dépôt privé.
        noterAnnule(dernier.id);
        programmerEnvoi();
      }
      return dernier;
    },
    auRaison: (id, raison) => {
      const swipes = ajouterRaison(etat.swipes, id, raison);
      if (swipes !== etat.swipes) {
        sauverSwipes(swipes, { modifies: [id] });
        programmerEnvoi();
      }
    },
    peutAnnuler: () => etat.swipes.length > 0,
    echauffementFait: () => echauffementFait(etat.swipes),
    vraisSwipes: () => etat.swipes.length - echauffementFait(etat.swipes),
    auElargir: () => naviguer('reglages'),
    indisponible: pileIndisponible,
    auReessayer: () => {
      etat.pileChargee = false;
      naviguer('swipe');
      chargerLaPile().catch((e) => console.error('Rechargement de la pile impossible', e?.name));
    },
    // Revenir sur l'onglet Swipe garde la même carte sur le dessus.
    idDessus: etat.carteDessus,
    auDessus: (id) => { etat.carteDessus = id; },
  }),
  favoris: () => ({
    ouvrirFiche: (id) => ouvrirFiche(id, 'favoris'),
  }),
  historique: () => ({
    ouvrirFiche: (id) => ouvrirFiche(id, 'historique'),
    auRepecher,
  }),
  detail: () => ({
    id: etat.fiche?.id,
    origine: etat.fiche?.origine ?? 'favoris',
    auRepecher,
    retour: fermerFiche,
    auQuitter: quitterFiche,
  }),
  questionnaire: () => ({
    profil: etat.profil,
    auValider: (profil) => {
      etat.profil = { ...profil, questionnaireFait: true };
      sauverProfil();
      naviguer('swipe');
    },
  }),
  reglages: () => ({
    profil: etat.profil,
    auEnregistrer: (profil) => {
      etat.profil = { ...profil, questionnaireFait: true };
      sauverProfil();
    },
    auToutEffacer: toutEffacer,
  }),
};

function naviguer(nom, extra = {}) {
  const cible = !etat.profil.questionnaireFait ? 'questionnaire' : nom;
  etat.ecran = cible;
  afficherEcran(cible, {
    etat,
    naviguer,
    sauverProfil,
    sauverSwipes,
    synchro: actionsSynchro,
    ...(donneesPour[cible]?.() ?? {}),
    ...extra,
  });
}

function brancherNavigation() {
  for (const bouton of document.querySelectorAll('.nav [data-ecran]')) {
    bouton.addEventListener('click', () => naviguer(bouton.dataset.ecran));
  }
}

// --- Autres copies ouvertes de l'appli (appli installée + onglet du navigateur) ---
// Le stockage est partagé : quand une autre copie écrit, celle-ci relit le profil et les swipes,
// puis redessine l'écran affiché (sauf une fiche en cours de lecture, ou un formulaire en cours).

function resynchroniser() {
  const swipes = lireSwipes();
  const profil = lireProfil();
  const swipesChanges = JSON.stringify(swipes) !== JSON.stringify(etat.swipes);
  const profilChange = JSON.stringify(profil) !== JSON.stringify(etat.profil);
  if (!swipesChanges && !profilChange) return;
  const questionnaireAvant = etat.profil.questionnaireFait;
  etat.swipes = swipes;
  etat.profil = profil;
  session.modifies.clear();
  session.supprimes.clear();
  majBandeau();

  const ecran = etat.ecran;
  if (ecran === 'detail' || ecran === null) return;
  // Un formulaire n'est redessiné que si le questionnaire a été fait (ou tout effacé) ailleurs.
  const formulaire = ecran === 'questionnaire' || ecran === 'reglages';
  if (formulaire && profil.questionnaireFait === questionnaireAvant) return;
  const cible = ecran === 'questionnaire' ? 'swipe' : ecran;
  const defilement = window.scrollY;
  naviguer(cible);
  if (etat.ecran === ecran) window.scrollTo(0, defilement);
}

window.addEventListener('storage', (e) => {
  // e.key null : tout le stockage a été vidé.
  if (e.key === null || e.key === CLE_SWIPES || e.key === CLE_PROFIL) resynchroniser();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    resynchroniser();
    synchroniser(); // relecture du dépôt (au plus une fois par minute) et envoi de ce qui attend
  } else if (envoiNecessaire || minuteurEnvoi !== null || lireEtatSynchro().profilEnAttente) {
    envoyerEnFond(); // l'appli passe en arrière-plan : ce qui attend part tout de suite
  }
});

// Retour du réseau : ce qui attendait part.
window.addEventListener('online', () => synchroniser());

// Redessine une liste ou l'écran de swipe (jamais une fiche en cours de lecture ni un formulaire).
function redessiner() {
  if (etat.ecran === 'swipe' || etat.ecran === 'favoris' || etat.ecran === 'historique') {
    const defilement = window.scrollY;
    naviguer(etat.ecran);
    window.scrollTo(0, defilement);
  }
}

// --- Démarrage ---

// Cartes déjà vues avant « Tout effacer » : écartées des piles générées avant cette date.
// Une pile générée après (le récolteur ne les repropose plus) rend la liste inutile.
function ecarterDejaVues(pile) {
  const ecartes = objetOuVide(store.lire(CLE_ECARTES, null));
  if (!Array.isArray(ecartes.ids) || pile.source === 'demo') return pile;
  const genereLe = Date.parse(pile.genere_le ?? '');
  if (Number.isFinite(genereLe) && genereLe >= Date.parse(ecartes.avant ?? '')) {
    store.effacer(CLE_ECARTES);
    return pile;
  }
  return retirerIds(pile, new Set(ecartes.ids));
}

function installerPile(pile, { redessiner: redessinerEcran = true } = {}) {
  pileBrute = pile;
  viderCacheEmpreintes(); // nouvelle pile : les empreintes décodées en cache ne servent plus
  etat.pile = ecarterDejaVues(pile);
  etat.pileChargee = true;
  if (pile.erreurs.length > 0) console.warn('Pile : annonces ignorées', pile.erreurs);
  // Une vraie pile remplace la démo : les swipes des cartes de démo sont oubliés (une seule fois).
  const sansDemo = oublierDemo(etat.swipes, pile.source);
  if (sansDemo !== etat.swipes) {
    const gardes = new Set(sansDemo.map((s) => s.id));
    sauverSwipes(sansDemo, { supprimes: etat.swipes.filter((s) => !gardes.has(s.id)).map((s) => s.id) });
  }
  majBandeau();
  // L'écran de swipe (et le profil de style des Favoris) affiché avant l'arrivée de la pile
  // est redessiné avec elle.
  if (redessinerEcran && (etat.ecran === 'swipe' || etat.ecran === 'favoris')) naviguer(etat.ecran);
}

// Avec une clé : pile du dépôt privé (dans une synchronisation complète) ; sans clé : pile de démo.
async function chargerLaPile() {
  if (lireCle()) {
    await synchroniser({ forcer: true });
    return;
  }
  installerPile(await chargerPile(URL_PILE, store));
}

async function demarrer() {
  // Après un rechargement sur une fiche, l'entrée de l'historique n'est plus une fiche ouverte.
  if (history.state?.sdFiche) history.replaceState(null, '');
  brancherNavigation();
  majBandeau();
  naviguer(etat.profil.questionnaireFait ? 'swipe' : 'questionnaire');
  await chargerLaPile();
}

demarrer().catch((e) => {
  console.error('Démarrage de Swipe Dressing impossible', e);
  const conteneur = document.getElementById('ecran');
  if (!conteneur) return;
  const message = document.createElement('p');
  message.className = 'erreur-demarrage';
  message.setAttribute('role', 'alert');
  message.textContent = 'Swipe Dressing n’a pas pu démarrer. Recharge la page pour réessayer.';
  conteneur.replaceChildren(message);
});
enregistrerServiceWorker();
