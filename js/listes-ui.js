// Écrans Favoris, Historique et fiche détail d'une annonce.
// Aucun état de l'appli ici : main.js fournit les swipes et les actions (ouvrir, repêcher, retour).
// Tout le texte des annonces passe par des nœuds texte (helper `el`), jamais par innerHTML.

import { el, enregistrerEcran, titre, photoAvecRepli } from './ecrans.js';
import { favoris, historique, empreintes, LIBELLES_RAISONS } from './paquet.js';
import {
  formaterPrix, formaterPct, libelleSite, lignesFiche, photosDe, urlSure, profilAAfficher,
} from './fiche.js';

const ruban = () => el('span', { class: 'ruban' }, 'Plus dispo');

const libelleRaison = (raison) => (raison ? LIBELLES_RAISONS[raison] ?? null : null);

// --- Vignettes (grille commune aux Favoris et à l'Historique) ---

function vignette(swipe, ouvrir, pied = null) {
  const c = swipe.carte ?? {};
  const prix = formaterPrix(c.prix);
  const site = libelleSite(c.site);
  const nom = [c.titre, prix, site, c.dispo === false ? 'plus disponible' : null].filter(Boolean).join(', ');
  return el('li', { class: 'vignette', 'data-id': swipe.id },
    el('button', { type: 'button', class: 'vignette-ouvrir', 'aria-label': nom, onclick: () => ouvrir(swipe.id) },
      el('span', { class: 'vignette-photo' },
        photoAvecRepli(c.photo, { decoding: 'async', loading: 'lazy' }),
        c.dispo === false ? ruban() : null),
      el('span', { class: 'vignette-infos' },
        el('span', { class: 'vignette-prix' }, prix),
        site ? el('span', { class: 'vignette-site' }, site) : null)),
    pied);
}

const grille = (vignettes) => el('ul', { class: 'grille', role: 'list' }, vignettes);

function vide(texte, aide) {
  return el('div', { class: 'liste-vide' },
    el('p', { class: 'liste-vide-titre' }, texte),
    aide ? el('p', { class: 'aide' }, aide) : null);
}

// --- Profil de style (en haut des Favoris) ---

function sectionProfil(swipes, styles) {
  let aimes;
  try {
    aimes = empreintes(swipes, 'droite');
  } catch (e) {
    console.warn('Profil de style : empreinte illisible', e);
    return null;
  }
  const profil = profilAAfficher(aimes, styles);
  if (profil.etat === 'indisponible') return null;
  const contenu = profil.etat === 'trop-tot'
    ? el('p', { class: 'aide' }, 'Swipe encore un peu pour découvrir ton style')
    : el('ul', { class: 'profil-barres', role: 'list' },
      profil.barres.map((b) => el('li', { class: 'profil-barre' },
        el('span', { class: 'profil-nom' }, b.libelle),
        el('span', { class: 'profil-pct' }, formaterPct(b.pct)),
        el('span', { class: 'profil-jauge', 'aria-hidden': 'true' },
          el('span', { style: `width: ${b.pct}%` })))));
  return el('section', { class: 'profil-style', 'aria-labelledby': 'titre-profil' },
    el('h2', { id: 'titre-profil' }, 'Ton style'),
    contenu);
}

// --- Écran Favoris ---

enregistrerEcran('favoris', (conteneur, { etat, ouvrirFiche }) => {
  const liste = favoris(etat.swipes);
  conteneur.append(
    el('header', { class: 'entete' },
      titre('Favoris'),
      liste.length > 0
        ? el('p', { class: 'chapeau' }, liste.length === 1 ? '1 annonce' : `${liste.length} annonces`)
        : null),
    sectionProfil(etat.swipes, etat.pile?.styles ?? []),
    liste.length > 0
      ? grille(liste.map((s) => vignette(s, ouvrirFiche)))
      : vide('Aucun favori pour l\'instant', 'Swipe à droite les annonces qui te plaisent.'),
  );
});

// --- Écran Historique ---

function statutHistorique(swipe) {
  if (swipe.sens === 'droite') {
    return el('p', { class: 'vignette-statut statut-aime' }, swipe.repeche ? '♥ Repêchée' : '♥ Aimée');
  }
  const raison = libelleRaison(swipe.raison);
  return el('p', { class: 'vignette-statut statut-ecarte' }, raison ? `✕ ${raison}` : '✕ Écartée');
}

enregistrerEcran('historique', (conteneur, { etat, ouvrirFiche, auRepecher }) => {
  const liste = historique(etat.swipes);
  const annonce = el('p', { class: 'visuellement-cache', role: 'status', 'aria-live': 'polite' });

  function pied(swipe) {
    const statut = statutHistorique(swipe);
    if (swipe.sens === 'droite') return el('div', { class: 'vignette-pied' }, statut);
    const bouton = el('button', {
      type: 'button',
      class: 'bouton-repecher',
      onclick: () => {
        auRepecher(swipe.id);
        const piedNoeud = bouton.parentElement;
        piedNoeud.replaceChildren(statutHistorique({ ...swipe, sens: 'droite', repeche: true }));
        piedNoeud.closest('.vignette')?.querySelector('.vignette-ouvrir')?.focus();
        annonce.textContent = 'Ajoutée aux favoris.';
      },
    }, 'Finalement j\'aime');
    return el('div', { class: 'vignette-pied' }, statut, bouton);
  }

  conteneur.append(
    el('header', { class: 'entete' },
      titre('Historique'),
      liste.length > 0
        ? el('p', { class: 'chapeau' }, 'Une erreur de swipe ? Repêche l’annonce ici.')
        : null),
    liste.length > 0
      ? grille(liste.map((s) => vignette(s, ouvrirFiche, pied(s))))
      : vide('Historique vide', 'Les annonces que tu swipes apparaîtront ici.'),
    annonce,
  );
});

// --- Fiche détail ---

function carrousel(photos, plusDispo) {
  const n = Math.max(photos.length, 1);
  const piste = el('div', {
    class: 'carrousel-piste',
    role: 'region',
    'aria-label': n > 1 ? `Photos de l'annonce, ${n} photos` : 'Photo de l\'annonce',
    tabindex: n > 1 ? '0' : null,
  },
  (photos.length > 0 ? photos : ['']).map((src, i) => el('div', {
    class: 'carrousel-photo',
    'aria-label': n > 1 ? `Photo ${i + 1} sur ${n}` : null,
    role: n > 1 ? 'group' : null,
  }, photoAvecRepli(src, { decoding: 'async', draggable: 'false' }))));

  let compteur = null;
  if (n > 1) {
    compteur = el('p', { class: 'carrousel-compteur', 'aria-hidden': 'true' }, `1/${n}`);
    piste.addEventListener('scroll', () => {
      const largeur = piste.clientWidth || 1;
      const i = Math.min(n - 1, Math.max(0, Math.round(piste.scrollLeft / largeur)));
      compteur.textContent = `${i + 1}/${n}`;
    }, { passive: true });
  }
  return el('div', { class: 'carrousel' }, piste, compteur, plusDispo ? ruban() : null);
}

enregistrerEcran('detail', (conteneur, donnees) => {
  const { etat, id, origine, retour, auRepecher, auQuitter } = donnees;
  const barre = el('div', { class: 'fiche-barre' },
    el('button', { type: 'button', class: 'bouton-retour', onclick: () => retour() }, '← Retour'));
  const swipe = etat.swipes.find((s) => s.id === id);

  if (!swipe) {
    conteneur.append(barre, el('section', { class: 'fiche' },
      titre('Annonce introuvable'),
      el('p', { class: 'aide' }, 'Cette annonce n’est plus dans tes favoris ni dans ton historique.')));
    return auQuitter;
  }

  const c = swipe.carte ?? {};
  const lignes = lignesFiche(c);
  const raison = origine === 'historique' && swipe.sens === 'gauche' ? libelleRaison(swipe.raison) : null;
  if (raison) lignes.push({ cle: 'raison', libelle: 'Refusée pour', valeur: raison });
  const url = urlSure(c.url);
  const statut = el('p', { class: 'statut', role: 'status', 'aria-live': 'polite' });

  const infos = lignes.length > 0
    ? el('dl', { class: 'fiche-infos' },
      lignes.map((l) => el('div', { class: 'fiche-ligne', 'data-cle': l.cle }, el('dt', {}, l.libelle), el('dd', {}, l.valeur))))
    : null;

  const actions = el('div', { class: 'fiche-actions' },
    url
      ? el('a', { class: 'bouton bouton-principal bouton-lien', href: url, target: '_blank', rel: 'noopener' }, 'Voir l\'annonce')
      : el('p', { class: 'aide' }, 'Lien de l’annonce indisponible.'));

  if (origine === 'historique' && swipe.sens === 'gauche') {
    const repecher = el('button', {
      type: 'button',
      class: 'bouton bouton-secondaire',
      onclick: () => {
        auRepecher(swipe.id);
        repecher.remove();
        // Repêchée : elle n'est plus « refusée », la ligne de la raison disparaît.
        infos?.querySelector('[data-cle="raison"]')?.remove();
        if (infos && !infos.firstChild) infos.remove();
        statut.textContent = 'Ajoutée à tes favoris.';
      },
    }, 'Finalement j\'aime');
    actions.append(repecher);
  }
  actions.append(statut);

  conteneur.append(barre, el('article', { class: 'fiche' },
    carrousel(photosDe(c), c.dispo === false),
    el('header', { class: 'fiche-entete' },
      titre(c.titre ?? 'Annonce', { class: 'fiche-titre' }),
      el('p', { class: 'fiche-prix' }, formaterPrix(c.prix))),
    infos,
    typeof c.description === 'string' && c.description.trim()
      ? el('section', { class: 'fiche-description', 'aria-labelledby': 'titre-description' },
        el('h2', { id: 'titre-description' }, 'Description'),
        el('p', {}, c.description))
      : null,
    actions,
  ));
  return auQuitter;
});
