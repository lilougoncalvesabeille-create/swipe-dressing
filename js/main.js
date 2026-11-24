// Branchement de l'appli : état, sauvegarde, chargement de la pile et navigation.

import {
  profilParDefaut, prochaines, swiper, annuler, ajouterRaison, echauffementFait, repecher,
} from './paquet.js';
import { creerStore } from './store.js';
import { chargerPile } from './pile.js';
import { completerProfil } from './formulaire.js';
import { afficherEcran, majBandeauStockage } from './ecrans.js';
import './swipe-ui.js'; // enregistre l'écran « swipe »
import './listes-ui.js'; // enregistre les écrans « favoris », « historique » et « detail »

const CLE_PROFIL = 'sd:profil';
const CLE_SWIPES = 'sd:swipes';
const PREFIXE = 'sd:';
const URL_PILE = 'data/demo-pile.json';

let store = creerStore();

const pileVide = () => ({ cartes: [], echauffement: [], styles: [], erreurs: [] });

function lireSwipes() {
  const lus = store.lire(CLE_SWIPES, []);
  return Array.isArray(lus) ? lus : [];
}

// État de l'appli : la seule source de vérité. Les écrans le lisent par `donnees.etat`.
const etat = {
  profil: completerProfil(store.lire(CLE_PROFIL, null)),
  swipes: lireSwipes(),
  pile: pileVide(),
  pileChargee: false,
  ecran: null,
  fiche: null, // {id, origine, defilement, jeton} : fiche détail ouverte
};

function majBandeau() {
  majBandeauStockage(store.persistant);
}

function sauverProfil() {
  store.ecrire(CLE_PROFIL, etat.profil);
  majBandeau();
}

// Remplace les swipes de l'état (si `swipes` est donné) puis les enregistre.
function sauverSwipes(swipes = etat.swipes) {
  etat.swipes = swipes;
  store.ecrire(CLE_SWIPES, etat.swipes);
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
  store = creerStore(); // oublie aussi les valeurs gardées en mémoire par l'ancien store
  etat.profil = profilParDefaut();
  etat.swipes = [];
  majBandeau();
  naviguer('questionnaire');
}

// --- Fiche détail et geste « retour » du téléphone ---
// Ouvrir une fiche ajoute une entrée à l'historique du navigateur (pushState) : le geste
// « retour » d'Android (ou le bouton du navigateur) ramène alors à la liste d'origine.

let ignorerPopstate = false;

const ficheEnCours = () => etat.fiche && history.state?.sdFiche === etat.fiche.jeton;

function ouvrirFiche(id, origine) {
  const jeton = `${Date.now()}-${Math.random()}`;
  etat.fiche = { id, origine, defilement: window.scrollY, jeton };
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
  if (ficheEnCours()) history.back();
  else revenirDeFiche();
}

// La fiche est quittée autrement (barre de navigation) : retire son entrée de l'historique,
// sans que le popstate qui suit ne change d'écran.
function quitterFiche() {
  if (ficheEnCours()) {
    ignorerPopstate = true;
    history.back();
  }
}

window.addEventListener('popstate', () => {
  if (ignorerPopstate) {
    ignorerPopstate = false;
    return;
  }
  if (etat.ecran === 'detail') revenirDeFiche();
});

function auRepecher(id) {
  const swipes = repecher(etat.swipes, id);
  sauverSwipes(swipes);
}

// Données propres à chaque écran, en plus de `etat` et `naviguer` communs à tous.
const donneesPour = {
  // La suite des cartes n'est jamais gardée en cache : elle est recalculée à chaque appel
  // avec le profil et les swipes du moment (un changement de réglages s'applique tout de suite).
  swipe: () => ({
    chargee: etat.pileChargee,
    suivantes: () => prochaines(etat.pile, etat.profil, etat.swipes, Math.random),
    auSwipe: (entree, sens) => {
      const swipes = swiper(etat.swipes, entree.carte, sens, { echauffement: entree.echauffement });
      if (swipes !== etat.swipes) sauverSwipes(swipes);
    },
    auAnnuler: () => {
      const dernier = etat.swipes.at(-1) ?? null;
      if (dernier) sauverSwipes(annuler(etat.swipes));
      return dernier;
    },
    auRaison: (id, raison) => {
      const swipes = ajouterRaison(etat.swipes, id, raison);
      if (swipes !== etat.swipes) sauverSwipes(swipes);
    },
    peutAnnuler: () => etat.swipes.length > 0,
    echauffementFait: () => echauffementFait(etat.swipes),
    vraisSwipes: () => etat.swipes.length - echauffementFait(etat.swipes),
    auElargir: () => naviguer('reglages'),
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

async function demarrer() {
  // Après un rechargement sur une fiche, l'entrée de l'historique n'est plus une fiche ouverte.
  if (history.state?.sdFiche) history.replaceState(null, '');
  brancherNavigation();
  majBandeau();
  naviguer(etat.profil.questionnaireFait ? 'swipe' : 'questionnaire');

  const pile = await chargerPile(URL_PILE, store);
  etat.pile = pile;
  etat.pileChargee = true;
  if (pile.erreurs.length > 0) console.warn('Pile : annonces ignorées', pile.erreurs);
  majBandeau();
  // L'écran de swipe (et le profil de style des Favoris) affiché avant l'arrivée de la pile
  // est redessiné avec elle.
  if (etat.ecran === 'swipe' || etat.ecran === 'favoris') naviguer(etat.ecran);
}

demarrer();
