// Rendu des écrans : registre d'écrans, photo avec repli, questionnaire et réglages.
// Ce module ne garde aucun état de l'appli : main.js lui passe tout par `donnees`.

import {
  LETTRES_TAILLE, RAYONS, MODES, LIBELLES_ETATS, CATEGORIES_LISTE, SITES_LISTE, PAYS, BORNES,
  valeursDepuisProfil, lireFormulaire, champBudget, GABARITS, estimerTailles, resumeEstimation,
} from './formulaire.js';
import { ETATS } from './paquet.js';
import { texteEtatSynchro, retourCle, problemeSaisieCle, ETAPES_CLE } from './synchro.js';
import { ilYA } from './fiche.js';

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
let nettoyage = null; // fonction rendue par l'écran affiché, appelée avant d'en afficher un autre

/**
 * rendu(conteneur, donnees) dessine l'écran. Il peut renvoyer une fonction de nettoyage
 * (retrait d'écouteurs sur document/window, minuteries) : afficherEcran l'appelle
 * avant de dessiner l'écran suivant, ou le même écran à nouveau.
 */
export function enregistrerEcran(nom, rendu) {
  if (typeof rendu !== 'function') throw new TypeError(`écran ${nom} : rendu attendu`);
  rendus.set(nom, rendu);
}

export function afficherEcran(nom, donnees = {}) {
  const rendu = rendus.get(nom);
  if (!rendu) throw new Error(`écran inconnu : ${nom}`);
  const precedent = nettoyage;
  nettoyage = null;
  if (precedent) {
    try {
      precedent();
    } catch (e) {
      console.error('Nettoyage de l’écran précédent impossible', e);
    }
  }
  const conteneur = document.getElementById('ecran');
  conteneur.replaceChildren();
  conteneur.dataset.ecran = nom;
  document.body.dataset.ecran = nom;
  for (const bouton of document.querySelectorAll('.nav [data-ecran]')) {
    if (bouton.dataset.ecran === nom) bouton.setAttribute('aria-current', 'page');
    else bouton.removeAttribute('aria-current');
  }
  const retour = rendu(conteneur, donnees);
  nettoyage = typeof retour === 'function' ? retour : null;
  window.scrollTo(0, 0);
  conteneur.querySelector('h1')?.focus({ preventScroll: true });
}

export function majBandeauStockage(persistant) {
  const bandeau = document.getElementById('bandeau-stockage');
  if (bandeau) bandeau.hidden = persistant !== false;
}

export const titre = (texte, attributs = {}) => el('h1', { tabindex: '-1', ...attributs }, texte);

// --- Photo d'annonce avec repli « Photo indisponible » (carte de swipe, vignettes, carrousel) ---

const photoIndisponible = () => el('span', { class: 'photo-indisponible' }, 'Photo indisponible');

/**
 * <img> de l'annonce, remplacée par « Photo indisponible » si l'adresse est vide
 * ou si l'image ne se charge pas. Le parent doit être en position: relative.
 */
export function photoAvecRepli(src, attributs = {}) {
  const adresse = typeof src === 'string' ? src.trim() : '';
  if (!adresse) return photoIndisponible();
  const img = el('img', { alt: '', ...attributs, src: adresse });
  // L'événement error est toujours asynchrone : l'écouteur posé ici l'attrape.
  img.addEventListener('error', () => img.replaceWith(photoIndisponible()), { once: true });
  return img;
}

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

// Aide « Je ne connais pas mes tailles » : taille, poids et pied → champs de tailles remplis
// (mode large partout). Ses valeurs voyagent avec le profil (profil.json, dépôt privé).
function aideTailles() {
  const retour = el('p', { class: 'aide aide-estimation', role: 'status', 'aria-live': 'polite' });
  const estimer = (e) => {
    const form = e.currentTarget.form;
    const valeur = (nom) => form.elements.namedItem(nom)?.value ?? '';
    const estimation = estimerTailles({
      gabarit: valeur('mens-gabarit'),
      tailleCm: valeur('mens-taille'),
      poidsKg: valeur('mens-poids'),
      piedCm: valeur('mens-pied'),
    });
    const resume = resumeEstimation(estimation);
    if (!resume) {
      retour.textContent = 'Entre au moins ta taille (en cm) et ton poids (en kg).';
      return;
    }
    const poser = (nom, v) => {
      const controle = form.elements.namedItem(nom);
      if (controle) controle.value = String(v);
    };
    const { haut, bas, pointure } = estimation;
    if (haut) { poser('haut-lettre', haut.lettre); poser('haut-eu', haut.eu); poser('haut-mode', 'large'); }
    if (bas) {
      poser('bas-lettre', bas.lettre); poser('bas-eu', bas.eu); poser('bas-w', bas.w); poser('bas-mode', 'large');
    }
    if (pointure) { poser('pointure-eu', pointure.eu); poser('pointure-mode', 'large'); }
    form.dispatchEvent(new Event('input', { bubbles: true }));
    retour.textContent = resume;
  };
  return el('details', { class: 'aide-tailles' },
    el('summary', {}, 'Je ne connais pas mes tailles'),
    el('p', { class: 'aide' },
      'Donne ta taille et ton poids : l’appli estime tes tailles et passe en mode large pour compenser. '
      + 'Ces mesures sont gardées avec ton profil, sur tous tes appareils.'),
    segments('mens-gabarit', 'Tableau de tailles', GABARITS),
    el('div', { class: 'grille-champs' },
      champ('Ta taille (cm)', nombre('mens-taille', BORNES.tailleCm, { placeholder: 'ex. 175' })),
      champ('Poids (kg)', nombre('mens-poids', BORNES.poidsKg, { placeholder: 'ex. 70' })),
      champ('Pied (cm)', nombre('mens-pied', BORNES.piedCm, { placeholder: 'ex. 26,5', decimal: true }),
        'Facultatif : talon contre un mur, mesure jusqu’au bout du plus long orteil.')),
    el('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: estimer }, 'Estimer mes tailles'),
    retour,
  );
}

// Budgets par catégorie (réglages) : repliés par défaut, vides = budget global.
function budgetsParCategorie() {
  return el('details', { class: 'budgets-categories' },
    el('summary', {}, 'Budget par catégorie'),
    el('p', { class: 'aide' }, 'Laisse vide pour utiliser le budget maximum ci-dessus.'),
    el('div', { class: 'grille-champs' },
      CATEGORIES_LISTE.map((c) => champ(`${c.libelle} (€)`,
        nombre(champBudget(c.valeur), { min: BORNES.budget.min, max: BORNES.budget.max, pas: 1 }, { placeholder: 'global' })))));
}

function etapes({ parCategorie = false } = {}) {
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
      intro: 'Remplis ce que tu connais, ou laisse l’appli les estimer. Une annonce dont la taille est dans un système laissé vide est écartée.',
      champs: [
        aideTailles(),
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
        el('p', { class: 'aide' }, 'Le pays et la région servent à la recherche des annonces (livraison).'),
        champ('Budget maximum par article (€)', Object.assign(
          nombre('budget', { min: BORNES.budget.min, max: BORNES.budget.max, pas: 1 }, { placeholder: 'ex. 60' }),
          { required: true },
        ), parCategorie ? null : 'Ajustable par catégorie dans les Réglages.'),
        parCategorie ? budgetsParCategorie() : null,
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
        el('fieldset', { class: 'puces-groupe', 'aria-describedby': 'pf-sites-aide' },
          el('legend', {}, 'Sites'),
          el('p', { class: 'aide', id: 'pf-sites-aide' },
            'Où chercher les annonces. Aucune case cochée = tous les sites.'),
          el('div', { class: 'puces' },
            SITES_LISTE.map((s) => el('label', { class: 'puce' },
              el('input', { type: 'checkbox', name: 'sites', value: s.valeur }),
              el('span', {}, s.libelle))))),
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
    if (nom === 'categories' || nom === 'sites') continue;
    const controle = form.elements.namedItem(nom);
    if (controle) controle.value = valeur;
  }
  const choisies = new Set(valeurs.categories);
  for (const caseCat of form.querySelectorAll('input[name="categories"]')) {
    caseCat.checked = choisies.has(caseCat.value);
  }
  const sites = new Set(valeurs.sites);
  for (const caseSite of form.querySelectorAll('input[name="sites"]')) {
    caseSite.checked = sites.has(caseSite.value);
  }
  const curseur = form.elements.namedItem('exploration');
  if (curseur) curseur.dispatchEvent(new Event('input'));
}

function lire(form) {
  const donnees = new FormData(form);
  const valeurs = Object.fromEntries(donnees);
  valeurs.categories = donnees.getAll('categories');
  if (form.querySelector('input[name="sites"]')) valeurs.sites = donnees.getAll('sites');
  return valeurs;
}

// Premier champ invalide d'un ensemble de champs, ou null (son bloc replié est ouvert pour le montrer).
function premierInvalide(racine, { ouvrir = true } = {}) {
  const invalide = [...racine.querySelectorAll('input, select')].find((c) => !c.checkValidity()) ?? null;
  const repli = ouvrir ? invalide?.closest('details') : null;
  if (repli) repli.open = true;
  return invalide;
}

/**
 * Construit le formulaire de profil dans `conteneur`.
 * options.etapes (défaut true) : questionnaire en 4 étapes avec Précédent / Suivant ;
 *   sinon une seule page (réglages).
 * options.exploration : ajoute le curseur d'exploration (0 à 50 %).
 * auValider(profil) reçoit un nouveau profil construit sur `profil` (jamais modifié).
 */
export function formulaireProfil(conteneur, profil, auValider, options = {}) {
  const { etapes: enEtapes = true, exploration = false, libelleValider, parCategorie = false } = options;
  const sections = etapes({ parCategorie }).map((etape, i) => el('fieldset', { class: 'etape', 'data-etape': i },
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
  const progression = el('div', { class: 'progression', 'aria-live': 'polite' });
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
  let modifie = false;
  form.addEventListener('input', () => { statut.textContent = ''; modifie = true; });
  form.addEventListener('change', () => { modifie = true; });

  // Le tableau de tailles de l'aide suit le rayon choisi (homme ou femme).
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'rayon' || !['homme', 'femme'].includes(e.target.value)) return;
    const gabarit = form.elements.namedItem('mens-gabarit');
    if (gabarit) gabarit.value = e.target.value;
  });

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
    modifie = false;
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
  // Réglages quittés sans « Enregistrer » : les changements valides sont gardés quand même
  // (un champ invalide les fait abandonner, comme avant). Renvoie true si le profil a été enregistré.
  form.enregistrerEnPartant = () => {
    if (enEtapes || !modifie || premierInvalide(form, { ouvrir: false })) return false;
    modifie = false;
    auValider(lireFormulaire(lire(form), profil));
    return true;
  };
  form.abandonner = () => { modifie = false; };
  return form;
}

// --- Écrans questionnaire et réglages ---

// « Déjà utilisé sur un autre appareil ? » : relier ce téléphone au dépôt avant le questionnaire.
// Le profil, les favoris et l'historique du dépôt arrivent alors ici (le questionnaire est sauté).
function boiteRelier(synchro, retourLien) {
  const champ = el('input', {
    type: 'password', id: 'relier-cle', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
    spellcheck: 'false', placeholder: 'github_pat_…',
  });
  const retour = el('p', { class: 'statut', role: 'status', 'aria-live': 'polite' });
  const bouton = el('button', { type: 'button', class: 'bouton bouton-principal' }, 'Récupérer mes données');
  const montrer = ({ texte, erreur }) => {
    retour.textContent = texte ?? '';
    retour.classList.toggle('statut-erreur', !!erreur);
  };
  bouton.addEventListener('click', async () => {
    const saisie = champ.value;
    champ.value = ''; // la clé ne reste pas affichée dans la page
    const probleme = problemeSaisieCle(saisie);
    if (probleme) {
      montrer({ texte: probleme, erreur: true });
      return;
    }
    bouton.disabled = true;
    montrer({ texte: 'Test de la clé…' });
    let resultat;
    try {
      resultat = await synchro.enregistrerCle(saisie);
    } catch {
      resultat = { ok: false, raison: 'github', message: 'Le test de la clé a échoué : réessaie plus tard.' };
    }
    bouton.disabled = false;
    montrer(resultat.enregistree
      ? { texte: 'Appareil relié : ton profil et tes favoris arrivent.' }
      : { ...retourCle(resultat), erreur: true });
  });
  if (retourLien) montrer(retourLien);
  return el('details', { class: 'aide-tailles relier', open: !!retourLien },
    el('summary', {}, 'Déjà utilisé sur un autre appareil ?'),
    el('p', { class: 'aide' },
      'Colle ta clé GitHub (celle créée pour Swipe Dressing) : ton profil, tes favoris et ton historique '
      + 'arrivent ici. Ou, sur l’autre appareil : Réglages → Synchronisation → « Copier le lien pour un '
      + 'autre appareil », puis ouvre ce lien ici.'),
    el('label', { for: 'relier-cle', class: 'visuellement-cache' }, 'Clé GitHub'),
    champ,
    bouton,
    retour,
  );
}

enregistrerEcran('questionnaire', (conteneur, { profil, auValider, synchro, retourLien }) => {
  conteneur.append(
    el('header', { class: 'entete' },
      titre('Bienvenue'),
      el('p', { class: 'chapeau' },
        'Quelques questions pour ne te montrer que ce qui te va. Tout reste modifiable dans les Réglages.')),
  );
  if (synchro) conteneur.append(boiteRelier(synchro, retourLien));
  formulaireProfil(conteneur, profil, auValider, { etapes: true });
});

// --- Réglages → « Synchronisation » ---
// La clé GitHub n'est jamais relue ni affichée : seuls ses 4 derniers caractères (synchro.finCle())
// le sont. Le champ est vidé dès la saisie lue, avant même le test.

const RAFRAICHIR_DATES = 30_000; // ms : « il y a X min » reste juste tant que l'écran est ouvert

/**
 * Section « Synchronisation » des Réglages. Renvoie {section, nettoyer}.
 * `synchro` : actions de main.js (cleEnregistree, enregistrerCle, testerCle, oublierCle,
 * synchroniser, finCle) ; `etat.synchro` est relu à chaque événement « sd:synchro ».
 */
function sectionSynchro(synchro, etat) {
  const champCle = el('input', {
    type: 'password', id: 'sync-cle', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
    spellcheck: 'false', 'aria-describedby': 'sync-cle-aide',
  });
  const ligneEtat = el('p', { class: 'synchro-etat' });
  const ligneCle = el('p', { class: 'aide synchro-cle' });
  const ligneRecolte = el('p', { class: 'aide' });
  const ligneEnvoi = el('p', { class: 'aide' });
  const retour = el('p', { class: 'statut synchro-retour', role: 'status', 'aria-live': 'polite' });
  const detail = el('p', { class: 'aide synchro-detail', hidden: true });
  const boutonEnregistrer = el('button', { type: 'button', class: 'bouton bouton-principal' }, 'Enregistrer et tester');
  const boutonRetirer = el('button', { type: 'button', class: 'bouton bouton-secondaire' }, 'Retirer la clé');
  const boutonLien = el('button', { type: 'button', class: 'bouton bouton-secondaire' },
    'Copier le lien pour un autre appareil');

  let occupe = false;
  // Dernier état affiché hors « en-cours » (texte et couleur) : pas de clignotement à chaque synchro.
  let texteStable = null;
  let statutStable = null;

  function montrerRetour({ texte, detail: precision, erreur }) {
    retour.textContent = texte ?? '';
    retour.classList.toggle('statut-erreur', !!erreur);
    detail.textContent = precision ?? '';
    detail.hidden = !precision;
  }

  function maj() {
    const avecCle = synchro.cleEnregistree();
    const etatSynchro = etat.synchro ?? {};
    // Le réseau coupé se voit tout de suite, sans attendre la prochaine synchronisation.
    const horsLigne = navigator.onLine === false && etatSynchro.statut !== 'cle-refusee';
    const statut = !avecCle ? 'sans-cle' : horsLigne ? 'hors-ligne' : etatSynchro.statut;
    if (statut !== 'en-cours' || statutStable === null) {
      statutStable = statut;
      texteStable = texteEtatSynchro(statut);
    }
    if (ligneEtat.textContent !== texteStable) ligneEtat.textContent = texteStable;
    ligneEtat.dataset.statut = statutStable;
    const fin = avecCle ? synchro.finCle() : '';
    ligneCle.textContent = fin ? `Clé enregistrée : …${fin}` : 'Clé enregistrée.';
    ligneCle.hidden = !avecCle;
    const maintenant = new Date();
    ligneRecolte.textContent = `Dernière récolte : ${ilYA(etatSynchro.recolte?.dernier_passage, maintenant) ?? 'pas encore reçue'}`;
    ligneEnvoi.textContent = `Derniers choix envoyés : ${ilYA(etatSynchro.dernierEnvoi, maintenant) ?? 'pas encore'}`;
    ligneRecolte.hidden = !avecCle;
    ligneEnvoi.hidden = !avecCle;
    boutonRetirer.hidden = !avecCle;
    boutonLien.hidden = !avecCle;
    champCle.placeholder = avecCle ? 'Colle une nouvelle clé pour la remplacer' : 'github_pat_…';
    boutonEnregistrer.disabled = occupe;
    boutonRetirer.disabled = occupe;
  }

  async function enregistrer() {
    if (occupe) return;
    // La saisie est lue puis effacée du champ tout de suite : la clé ne reste pas affichée dans la page.
    const saisie = champCle.value;
    champCle.value = '';
    const avecCle = synchro.cleEnregistree();
    // Champ vide avec une clé déjà enregistrée : on teste celle-ci.
    if (!saisie.trim() && !avecCle) {
      montrerRetour({ texte: problemeSaisieCle(saisie), erreur: true });
      champCle.focus();
      return;
    }
    occupe = true;
    maj();
    montrerRetour({ texte: 'Test de la clé…' });
    let resultat;
    try {
      if (saisie.trim()) {
        resultat = await synchro.enregistrerCle(saisie);
      } else {
        resultat = await synchro.testerCle();
        if (resultat.ok) synchro.synchroniser();
      }
    } catch {
      resultat = { ok: false, raison: 'github', message: 'Le test de la clé a échoué : réessaie plus tard.' };
    } finally {
      occupe = false;
    }
    montrerRetour(retourCle(resultat));
    maj();
  }

  function retirer() {
    if (occupe) return;
    if (!window.confirm('Retirer la clé ? Ce téléphone repassera en mode démo. Tes choix déjà envoyés restent dans le dépôt privé.')) return;
    synchro.oublierCle();
    montrerRetour({ texte: 'Clé retirée : retour au mode démo.' });
    maj();
  }

  async function copierLien() {
    const { ok, partage } = await synchro.copierLien();
    montrerRetour(ok
      ? {
        texte: `${partage ? 'Lien partagé' : 'Lien copié'}. Ouvre-le sur ton autre appareil : la clé y sera enregistrée et tout se synchronisera.`,
        detail: 'Ne le partage avec personne : il donne accès à tes données. Une fois l’appareil relié, '
          + 'efface le lien (messages, presse-papiers) et l’historique du navigateur.',
      }
      : { texte: 'Copie impossible sur cet appareil : colle ta clé à la main sur l’autre appareil.', erreur: true });
  }

  boutonEnregistrer.addEventListener('click', enregistrer);
  boutonRetirer.addEventListener('click', retirer);
  boutonLien.addEventListener('click', copierLien);
  champCle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      enregistrer();
    }
  });
  champCle.addEventListener('input', () => montrerRetour({}));

  const section = el('section', { class: 'zone-synchro', 'aria-labelledby': 'titre-synchro' },
    el('h2', { id: 'titre-synchro' }, 'Synchronisation'),
    ligneEtat,
    ligneCle,
    ligneRecolte,
    ligneEnvoi,
    el('div', { class: 'champ' },
      el('label', { for: 'sync-cle' }, 'Clé GitHub'),
      champCle,
      el('p', { class: 'aide', id: 'sync-cle-aide' },
        'Gardée seulement sur ce téléphone. Une fois enregistrée, elle n’est plus jamais affichée.')),
    el('div', { class: 'synchro-boutons' }, boutonEnregistrer, boutonRetirer),
    boutonLien,
    retour,
    detail,
    el('details', { class: 'pas-a-pas' },
      el('summary', {}, 'Comment créer la clé ?'),
      el('ol', {}, ETAPES_CLE.map((etape) => el('li', {}, etape)))),
  );

  maj();
  window.addEventListener('sd:synchro', maj);
  window.addEventListener('online', maj);
  window.addEventListener('offline', maj);
  const minuterie = setInterval(maj, RAFRAICHIR_DATES);
  return {
    section,
    nettoyer: () => {
      window.removeEventListener('sd:synchro', maj);
      window.removeEventListener('online', maj);
      window.removeEventListener('offline', maj);
      clearInterval(minuterie);
    },
  };
}

enregistrerEcran('reglages', (conteneur, { profil, auEnregistrer, auToutEffacer, synchro, etat }) => {
  conteneur.append(el('header', { class: 'entete' }, titre('Réglages')));
  const form = formulaireProfil(conteneur, profil, auEnregistrer,
    { etapes: false, exploration: true, parCategorie: true });
  const zoneSynchro = synchro && etat ? sectionSynchro(synchro, etat) : null;
  if (zoneSynchro) conteneur.append(zoneSynchro.section);
  conteneur.append(
    el('section', { class: 'zone-danger', 'aria-labelledby': 'titre-effacer' },
      el('h2', { id: 'titre-effacer' }, 'Repartir de zéro'),
      el('p', { class: 'aide' }, 'Efface ton profil, tes favoris et ton historique (sur tous tes appareils reliés si une clé est enregistrée).'),
      el('button', {
        type: 'button', class: 'bouton bouton-danger',
        onclick: () => {
          if (window.confirm('Tout effacer ? Ton profil, tes favoris et ton historique seront supprimés, ici et sur tes autres appareils reliés. Les annonces déjà vues ne reviendront pas.')) {
            form.abandonner(); // le formulaire quitté ne doit pas réécrire le profil effacé
            auToutEffacer();
          }
        },
      }, 'Tout effacer')),
  );
  return () => {
    form.enregistrerEnPartant();
    zoneSynchro?.nettoyer();
  };
});
