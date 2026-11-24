// Branchement de l'appli : état, sauvegarde, chargement de la pile et navigation.

import {
  profilParDefaut, prochaines, swiper, annuler, ajouterRaison, echauffementFait,
} from './paquet.js';
import { creerStore } from './store.js';
import { chargerPile } from './pile.js';
import { completerProfil } from './formulaire.js';
import { afficherEcran, majBandeauStockage } from './ecrans.js';
import './swipe-ui.js'; // enregistre l'écran « swipe »

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
