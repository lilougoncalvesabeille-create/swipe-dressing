// Rendu des écrans : registre d'écrans, questionnaire, réglages et écrans d'attente.
// Ce module ne garde aucun état de l'appli : main.js lui passe tout par `donnees`.

import {
  LETTRES_TAILLE, RAYONS, MODES, LIBELLES_ETATS, CATEGORIES_LISTE, PAYS, BORNES,
  valeursDepuisProfil, lireFormulaire,
} from './formulaire.js';
import { ETATS } from './paquet.js';

// --- Petit outil de construction du DOM (sans innerHTML : aucun texte n'est interprété) ---

export function el(tag, attributs = {}, ...enfants) {
  const noeud = document.createElement(tag);
  for (const [nom, valeur] of Object.entries(attributs ?? {})) {
    if (valeur === false || valeur === null || valeur === undefined) continue;
    if (nom === 'class') noeud.className = valeur;
    else if (nom.startsWith('on') && typeof valeur === 'function') {
      noeud.addEventListener(nom.slice(2), valeur);
    } else if (valeur === true) noeud.setAttribute(nom, '');
    else noeud.setAttribute(nom, String(valeur));
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    noeud.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return noeud;
}

// --- Registre d'écrans ---

const rendus = new Map();

export function enregistrerEcran(nom, rendu) {
  if (typeof rendu !== 'function') throw new TypeError(`écran ${nom} : rendu attendu`);
  rendus.set(nom, rendu);
}

export function afficherEcran(nom, donnees = {}) {
  const rendu = rendus.get(nom);
  if (!rendu) throw new Error(`écran inconnu : ${nom}`);
  const conteneur = document.getElementById('ecran');
  conteneur.replaceChildren();
  conteneur.dataset.ecran = nom;
  document.body.dataset.ecran = nom;
  for (const bouton of document.querySelectorAll('.nav [data-ecran]')) {
    if (bouton.dataset.ecran === nom) bouton.setAttribute('aria-current', 'page');
    else bouton.removeAttribute('aria-current');
  }
  rendu(conteneur, donnees);
  window.scrollTo(0, 0);
  conteneur.querySelector('h1')?.focus({ preventScroll: true });
}

export function majBandeauStockage(persistant) {
  const bandeau = document.getElementById('bandeau-stockage');
  if (bandeau) bandeau.hidden = persistant !== false;
}

const titre = (texte) => el('h1', { tabindex: '-1' }, texte);

function attente(texteTitre) {
  return (conteneur) => {
    conteneur.append(el('section', { class: 'attente' }, titre(texteTitre), el('p', {}, 'Bientôt…')));
  };
}

// Écrans d'attente : remplacés par les tâches 7 (swipe) et 8 (listes, fiche).
enregistrerEcran('swipe', attente('Swipe'));
enregistrerEcran('favoris', attente('Favoris'));
enregistrerEcran('historique', attente('Historique'));
enregistrerEcran('detail', attente('Fiche'));

// --- Formulaire de profil (partagé par le questionnaire et les réglages) ---

let compteurIds = 0;

function champ(libelle, controle, aide) {
  const id = controle.id || `pf-${++compteurIds}`;
  controle.id = id;
  const idAide = aide ? `${id}-aide` : null;
  if (idAide) controle.setAttribute('aria-describedby', idAide);
  return el('div', { class: 'champ' },
    el('label', { for: id }, libelle),
    controle,
    aide ? el('p', { class: 'aide', id: idAide }, aide) : null,
  );
}

function nombre(nom, bornes, { placeholder, decimal = false } = {}) {
  return el('input', {
    type: 'number', name: nom, min: bornes.min, max: bornes.max, step: bornes.pas,
    inputmode: decimal ? 'decimal' : 'numeric', placeholder,
  });
}

function liste(nom, options) {
  return el('select', { name: nom },
    options.map((o) => el('option', { value: o.valeur }, o.libelle)));
}

// Groupe de boutons radio présentés comme un sélecteur segmenté.
function segments(nom, legende, options, aide) {
  const idAide = aide ? `pf-${++compteurIds}-aide` : null;
  return el('fieldset', { class: 'segments-groupe', 'aria-describedby': idAide },
    el('legend', {}, legende),
    el('div', { class: 'segments' },
      options.map((o) => el('label', { class: 'segment' },
        el('input', { type: 'radio', name: nom, value: o.valeur }),
        el('span', {}, o.libelle)))),
    aide ? el('p', { class: 'aide', id: idAide }, aide) : null,
  );
}

const EXPLICATION_MODE = 'large = aussi la taille au-dessus et en dessous';

const lettres = (nom) => liste(nom, [
  { valeur: '', libelle: '—' },
  ...LETTRES_TAILLE.map((l) => ({ valeur: l, libelle: l })),
]);

function blocTaille(titreBloc, champs, nomMode) {
  return el('fieldset', { class: 'bloc-taille' },
    el('legend', {}, titreBloc),
    el('div', { class: 'grille-champs' }, champs),
    segments(nomMode, `Mode ${titreBloc.toLowerCase()}`, MODES, EXPLICATION_MODE),
  );
}

function etapes() {
  return [
    {
      titre: 'Toi',
      champs: [
        champ('Âge', nombre('age', BORNES.age, { placeholder: 'ex. 25' }), 'Facultatif.'),
        segments('rayon', 'Rayon', RAYONS),
      ],
    },
    {
      titre: 'Tes tailles',
      intro: 'Remplis ce que tu connais. Une annonce dont la taille est dans un système laissé vide est écartée.',
      champs: [
        blocTaille('Haut', [
          champ('Lettre', lettres('haut-lettre')),
          champ('EU', nombre('haut-eu', BORNES.eu, { placeholder: 'ex. 40' })),
        ], 'haut-mode'),
        blocTaille('Bas', [
          champ('Lettre', lettres('bas-lettre')),
          champ('EU', nombre('bas-eu', BORNES.eu, { placeholder: 'ex. 40' })),
          champ('W', nombre('bas-w', BORNES.w, { placeholder: 'ex. 32' })),
        ], 'bas-mode'),
        blocTaille('Pointure', [
          champ('EU', nombre('pointure-eu', BORNES.pointure, { placeholder: 'ex. 42,5', decimal: true })),
        ], 'pointure-mode'),
      ],
    },
    {
      titre: 'Livraison et budget',
      champs: [
        champ('Pays de livraison', liste('pays', PAYS)),
        champ('Région', el('input', {
          type: 'text', name: 'region', maxlength: 80, autocomplete: 'address-level1',
          placeholder: 'ex. Bretagne',
        }), 'Facultatif.'),
        champ('Budget maximum par article (€)', Object.assign(
          nombre('budget', { min: BORNES.budget.min, max: BORNES.budget.max, pas: 1 }, { placeholder: 'ex. 60' }),
          { required: true },
        )),
      ],
    },
    {
      titre: 'Tes envies',
      champs: [
        el('fieldset', { class: 'puces-groupe', 'aria-describedby': 'pf-categories-aide' },
          el('legend', {}, 'Catégories'),
          el('p', { class: 'aide', id: 'pf-categories-aide' }, 'Aucune sélection = toutes les catégories.'),
          el('div', { class: 'puces' },
            CATEGORIES_LISTE.map((c) => el('label', { class: 'puce' },
              el('input', { type: 'checkbox', name: 'categories', value: c.valeur }),
              el('span', {}, c.libelle))))),
        champ('État minimum (seconde main)', liste('etat-min',
          ETATS.map((e) => ({ valeur: e, libelle: LIBELLES_ETATS[e] ?? e })))),
        champ('Marques préférées', el('input', {
          type: 'text', name: 'marques-preferees', autocomplete: 'off', placeholder: 'ex. Carhartt, Patagonia',
        }), 'Sépare les marques par des virgules.'),
        champ('Marques à ne jamais montrer', el('input', {
          type: 'text', name: 'marques-bannies', autocomplete: 'off', placeholder: 'ex. Shein',
        }), 'Sépare les marques par des virgules.'),
      ],
    },
  ];
}

function remplir(form, profil) {
  const valeurs = valeursDepuisProfil(profil);
  for (const [nom, valeur] of Object.entries(valeurs)) {
    if (nom === 'categories') continue;
    const controle = form.elements.namedItem(nom);
    if (controle) controle.value = valeur;
  }
  const choisies = new Set(valeurs.categories);
  for (const caseCat of form.querySelectorAll('input[name="categories"]')) {
    caseCat.checked = choisies.has(caseCat.value);
  }
  const curseur = form.elements.namedItem('exploration');
  if (curseur) curseur.dispatchEvent(new Event('input'));
}

function lire(form) {
  const donnees = new FormData(form);
  const valeurs = Object.fromEntries(donnees);
  valeurs.categories = donnees.getAll('categories');
  return valeurs;
}

// Premier champ invalide d'un ensemble de champs, ou null.
const premierInvalide = (racine) =>
  [...racine.querySelectorAll('input, select')].find((c) => !c.checkValidity()) ?? null;

/**
 * Construit le formulaire de profil dans `conteneur`.
 * options.etapes (défaut true) : questionnaire en 4 étapes avec Précédent / Suivant ;
 *   sinon une seule page (réglages).
 * options.exploration : ajoute le curseur d'exploration (0 à 50 %).
 * auValider(profil) reçoit un nouveau profil construit sur `profil` (jamais modifié).
 */
export function formulaireProfil(conteneur, profil, auValider, options = {}) {
  const { etapes: enEtapes = true, exploration = false, libelleValider } = options;
  const sections = etapes().map((etape, i) => el('fieldset', { class: 'etape', 'data-etape': i },
    el('legend', { class: 'etape-titre' }, etape.titre),
    etape.intro ? el('p', { class: 'aide' }, etape.intro) : null,
    etape.champs,
  ));

  if (exploration) {
    const sortie = el('output', { for: 'pf-exploration', class: 'valeur-curseur' });
    const curseur = el('input', {
      type: 'range', id: 'pf-exploration', name: 'exploration',
      min: BORNES.exploration.min, max: BORNES.exploration.max, step: BORNES.exploration.pas,
      'aria-describedby': 'pf-exploration-aide',
      oninput: (e) => {
        sortie.value = `${e.target.value} %`;
        e.target.setAttribute('aria-valuetext', `${e.target.value} pour cent`);
      },
    });
    sections.push(el('fieldset', { class: 'etape' },
      el('legend', { class: 'etape-titre' }, 'Exploration'),
      el('div', { class: 'champ' },
        el('div', { class: 'ligne-curseur' }, el('label', { for: 'pf-exploration' }, 'Part de nouveauté'), sortie),
        curseur,
        el('p', { class: 'aide', id: 'pf-exploration-aide' },
          'Part des cartes choisies hors de tes goûts connus, pour te faire découvrir d’autres styles. 18 % par défaut.')),
    ));
  }

  const statut = el('p', { class: 'statut', role: 'status', 'aria-live': 'polite' });
  const precedent = el('button', { type: 'button', class: 'bouton bouton-secondaire' }, 'Précédent');
  const suivant = el('button', { type: 'submit', class: 'bouton bouton-principal' });
  const progression = el('div', { class: 'progression' });
  const barre = el('div', { class: 'progression-barre' }, el('span'));

  const form = el('form', { class: `formulaire-profil ${enEtapes ? 'en-etapes' : 'en-page'}`, novalidate: true },
    enEtapes ? [progression, barre] : null,
    sections,
    el('div', { class: 'actions' }, enEtapes ? precedent : null, suivant, statut),
  );

  let courante = 0;
  const derniere = sections.length - 1;

  function montrerEtape(i) {
    courante = i;
    sections.forEach((s, j) => { s.hidden = j !== i; });
    progression.textContent = `Étape ${i + 1} sur ${sections.length}`;
    barre.firstChild.style.width = `${((i + 1) / sections.length) * 100}%`;
    precedent.style.visibility = i === 0 ? 'hidden' : 'visible';
    suivant.textContent = i === derniere ? (libelleValider ?? 'C’est parti') : 'Suivant';
    window.scrollTo(0, 0);
  }

  // Un message « enregistré » disparaît dès qu'on modifie à nouveau un champ.
  form.addEventListener('input', () => { statut.textContent = ''; });

  precedent.addEventListener('click', () => {
    if (courante > 0) montrerEtape(courante - 1);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    statut.textContent = '';
    if (enEtapes && courante < derniere) {
      const invalide = premierInvalide(sections[courante]);
      if (invalide) invalide.reportValidity();
      else montrerEtape(courante + 1);
      return;
    }
    const invalide = premierInvalide(form);
    if (invalide) {
      if (enEtapes) montrerEtape(sections.findIndex((s) => s.contains(invalide)));
      invalide.reportValidity();
      return;
    }
    const nouveau = lireFormulaire(lire(form), profil);
    profil = nouveau;
    auValider(nouveau);
    if (!enEtapes) {
      remplir(form, nouveau);
      statut.textContent = 'Réglages enregistrés.';
    }
  });

  conteneur.append(form);
  remplir(form, profil);
  if (enEtapes) montrerEtape(0);
  else suivant.textContent = libelleValider ?? 'Enregistrer';
  return form;
}

// --- Écrans questionnaire et réglages ---

enregistrerEcran('questionnaire', (conteneur, { profil, auValider }) => {
  conteneur.append(
    el('header', { class: 'entete' },
      titre('Bienvenue'),
      el('p', { class: 'chapeau' },
        'Quelques questions pour ne te montrer que ce qui te va. Tout reste modifiable dans les Réglages.')),
  );
  formulaireProfil(conteneur, profil, auValider, { etapes: true });
});

enregistrerEcran('reglages', (conteneur, { profil, auEnregistrer, auToutEffacer }) => {
  conteneur.append(el('header', { class: 'entete' }, titre('Réglages')));
  formulaireProfil(conteneur, profil, auEnregistrer, { etapes: false, exploration: true });
  conteneur.append(
    el('section', { class: 'zone-danger', 'aria-labelledby': 'titre-effacer' },
      el('h2', { id: 'titre-effacer' }, 'Repartir de zéro'),
      el('p', { class: 'aide' }, 'Efface ton profil, tes favoris et ton historique sur ce téléphone.'),
      el('button', {
        type: 'button', class: 'bouton bouton-danger',
        onclick: () => {
          if (window.confirm('Tout effacer ? Ton profil, tes favoris et ton historique seront supprimés. Impossible de revenir en arrière.')) {
            auToutEffacer();
          }
        },
      }, 'Tout effacer')),
  );
});
