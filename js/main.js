// Branchement de l'appli : état, sauvegarde, chargement de la pile et navigation.

import {
  profilParDefaut, prochaines, swiper, annuler, ajouterRaison, echauffementFait, repecher,
  fusionnerSwipes, nettoyerSwipes, oublierDemo,
} from './paquet.js';
import { creerStore } from './store.js';
import { chargerPile } from './pile.js';
import { completerProfil } from './formulaire.js';
import { afficherEcran, majBandeauStockage } from './ecrans.js';
import { enregistrerServiceWorker } from './hors-connexion.js';
import './swipe-ui.js'; // enregistre l'écran « swipe »
import './listes-ui.js'; // enregistre les écrans « favoris », « historique » et « detail »

const CLE_PROFIL = 'sd:profil';
const CLE_SWIPES = 'sd:swipes';
const PREFIXE = 'sd:';
const URL_PILE = 'data/demo-pile.json';

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

// État de l'appli : la seule source de vérité. Les écrans le lisent par `donnees.etat`.
const etat = {
  profil: lireProfil(),
  swipes: lireSwipes(),
  pile: pileVide(),
  pileChargee: false,
  ecran: null,
  fiche: null, // {id, origine, defilement, jeton} : fiche détail ouverte
  carteDessus: null, // id de la carte visible sur le dessus de l'écran de swipe
};

// Changements voulus de cette copie de l'appli depuis sa dernière lecture ou écriture des swipes :
// ils gagnent sur le stockage lors de la fusion (voir fusionnerSwipes).
const session = { modifies: new Set(), supprimes: new Set() };

function majBandeau() {
  majBandeauStockage(store.persistant);
}

function sauverProfil() {
  store.ecrire(CLE_PROFIL, etat.profil);
  majBandeau();
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
  etat.swipes = fusionnerSwipes(lireSwipes(), swipes, session);
  store.ecrire(CLE_SWIPES, etat.swipes);
  // Le stockage est maintenant à jour avec cette copie : plus rien à faire gagner.
  session.modifies.clear();
  session.supprimes.clear();
  majBandeau();
}

// Efface toutes les clés `sd:*` du stockage du navigateur, puis repart d'un état neuf.
function toutEffacer() {
  try {
    const stockage = globalThis.localStorage;
    const cles = [];
    for (let i = 0; i < stockage.length; i++) {
      const cle = stockage.key(i);
      if (cle?.startsWith(PREFIXE)) cles.push(cle);
    }
    for (const cle of cles) stockage.removeItem(cle);
  } catch {
    // Stockage indisponible : il n'y a rien sur le disque à effacer.
  }
  store = nouveauStore(); // oublie aussi les valeurs gardées en mémoire par l'ancien store
  etat.profil = profilParDefaut();
  etat.swipes = [];
  etat.carteDessus = null;
  session.modifies.clear();
  session.supprimes.clear();
  majBandeau();
  naviguer('questionnaire');
}

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
      if (swipes !== etat.swipes) sauverSwipes(swipes, { modifies: [entree.carte.id] });
    },
    auAnnuler: () => {
      const dernier = etat.swipes.at(-1) ?? null;
      if (dernier) sauverSwipes(annuler(etat.swipes), { supprimes: [dernier.id] });
      return dernier;
    },
    auRaison: (id, raison) => {
      const swipes = ajouterRaison(etat.swipes, id, raison);
      if (swipes !== etat.swipes) sauverSwipes(swipes, { modifies: [id] });
    },
    peutAnnuler: () => etat.swipes.length > 0,
    echauffementFait: () => echauffementFait(etat.swipes),
    vraisSwipes: () => etat.swipes.length - echauffementFait(etat.swipes),
    auElargir: () => naviguer('reglages'),
    indisponible: pileIndisponible,
    auReessayer: () => {
      etat.pileChargee = false;
      naviguer('swipe');
      chargerLaPile().catch((e) => console.error('Rechargement de la pile impossible', e));
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
  if (document.visibilityState === 'visible') resynchroniser();
});

// --- Démarrage ---

async function chargerLaPile() {
  const pile = await chargerPile(URL_PILE, store);
  etat.pile = pile;
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
  if (etat.ecran === 'swipe' || etat.ecran === 'favoris') naviguer(etat.ecran);
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
