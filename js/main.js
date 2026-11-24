// Branchement de l'appli : état, sauvegarde, chargement de la pile et navigation.

import { profilParDefaut } from './paquet.js';
import { creerStore } from './store.js';
import { chargerPile } from './pile.js';
import { completerProfil } from './formulaire.js';
import { afficherEcran, majBandeauStockage } from './ecrans.js';

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
};

function majBandeau() {
  majBandeauStockage(store.persistant);
}

function sauverProfil() {
  store.ecrire(CLE_PROFIL, etat.profil);
  majBandeau();
}

function sauverSwipes() {
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

// Données propres à chaque écran, en plus de `etat` et `naviguer` communs à tous.
const donneesPour = {
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
  brancherNavigation();
  majBandeau();
  naviguer(etat.profil.questionnaireFait ? 'swipe' : 'questionnaire');

  const pile = await chargerPile(URL_PILE, store);
  etat.pile = pile;
  etat.pileChargee = true;
  if (pile.erreurs.length > 0) console.warn('Pile : annonces ignorées', pile.erreurs);
  majBandeau();
  // L'écran de swipe affiché avant l'arrivée de la pile est redessiné avec elle.
  if (etat.ecran === 'swipe') naviguer('swipe');
}

demarrer();
