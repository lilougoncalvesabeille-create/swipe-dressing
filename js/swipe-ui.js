// Écran de swipe : carte glissable (pointer events), boutons ✕ ↶ ♥, raison du refus, échauffement.
// Aucun état de l'appli ici : main.js fournit la suite des cartes et enregistre les swipes.
// Tout le texte des annonces passe par des nœuds texte (helper `el`), jamais par innerHTML.

import { el, enregistrerEcran, photoAvecRepli } from './ecrans.js';
import { RAISONS, LIBELLES_RAISONS, SEUIL_ECHAUFFEMENT, garderEnTete } from './paquet.js';
import { formaterPrix, libelleTaille, libelleSite, textesPileVide } from './fiche.js';
import { vitesseX, decisionSwipe, estUnTap, rotation, intensite } from './geste.js';
import { messageRecolte, MESSAGES_RECOLTE } from './synchro.js';

const DUREE_SORTIE = 250; // ms : animation de sortie (et verrou pendant ce temps)
const DUREE_RAISONS = 6000; // ms : temps d'affichage des puces de raison (assez pour un lecteur d'écran)
const DUREE_NOTE = 1500; // ms : confirmation « Noté »
const MAX_ECHANTILLONS = 30;

const mouvementReduit = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function construireCarte(entree, active) {
  const { carte, voisine } = entree;
  const photo = el('div', { class: 'carte-photo' },
    photoAvecRepli(carte.photo, { alt: '', draggable: 'false', decoding: 'async' }));

  const source = [libelleSite(carte.site), carte.marque].filter((x) => typeof x === 'string' && x.trim()).join(' · ');
  const infos = el('div', { class: 'carte-infos' },
    el('div', { class: 'carte-ligne' },
      el('h2', { class: 'carte-titre' }, carte.titre),
      el('p', { class: 'carte-prix' }, formaterPrix(carte.prix))),
    el('p', { class: 'carte-taille' },
      el('span', {}, libelleTaille(carte.taille)),
      voisine ? el('span', { class: 'badge-voisine' }, 'taille voisine') : null),
    source ? el('p', { class: 'carte-source' }, source) : null,
    carte.description ? el('p', { class: 'carte-description' }, carte.description) : null,
  );

  return el('article', {
    class: active ? 'carte' : 'carte carte-derriere',
    'data-id': carte.id,
    tabindex: active ? '0' : null,
    'aria-hidden': active ? null : 'true',
  },
  photo,
  infos,
  el('div', { class: 'carte-teinte', 'aria-hidden': 'true' }),
  el('span', { class: 'tampon tampon-oui', 'aria-hidden': 'true' }, 'J\'aime'),
  el('span', { class: 'tampon tampon-non', 'aria-hidden': 'true' }, 'Non'));
}

/**
 * Monte la pile de cartes dans `conteneur` et renvoie une fonction de nettoyage.
 * options :
 *   suivantes() -> Entree[]           suite recalculée à chaque appel ({carte, voisine, echauffement})
 *   auSwipe(entree, sens)             enregistre le swipe ('droite' | 'gauche')
 *   auAnnuler() -> swipe | null       retire le dernier swipe et le renvoie
 *   auRaison(id, raison)              note la raison du refus de la carte `id`
 *   peutAnnuler() -> boolean          active ou non le bouton ↶
 *   echauffementFait() -> number      swipes d'échauffement déjà faits
 *   vraisSwipes() -> number           swipes hors échauffement déjà faits
 *   auElargir()                       bouton « Élargir mes critères » de la pile vide
 *   indisponible() -> boolean         la pile n'a pas pu être chargée (pile vide = « Réessayer »)
 *   auReessayer()                     bouton « Réessayer » de la pile indisponible
 *   cleRefusee() -> boolean           la clé GitHub est refusée (pile vide = « vérifie-la dans Réglages »)
 *   auReglages()                      bouton « Ouvrir les Réglages » de la clé refusée
 *   idDessus                          carte à remettre sur le dessus au montage (si encore dans la suite)
 *   auDessus(id | null)               appelé à chaque changement de la carte du dessus
 */
export function monterPile(conteneur, options) {
  const {
    suivantes, auSwipe, auAnnuler,
    auRaison = () => {}, peutAnnuler = () => false, echauffementFait = () => 0, vraisSwipes = () => 0,
    auElargir = null, indisponible = () => false, auReessayer = null,
    cleRefusee = () => false, auReglages = null,
    idDessus = null, auDessus = () => {},
  } = options;

  let carteActive = null; // {noeud, entree, idDerriere}
  let verrou = false; // vrai pendant une animation de sortie / de retour
  let raisonsPour = null; // id de la carte dont on propose la raison du refus
  let minuterieRaisons = null;
  let detruit = false;
  const minuteries = new Set();

  function minuterie(fn, ms) {
    const id = setTimeout(() => {
      minuteries.delete(id);
      if (!detruit) fn();
    }, ms);
    minuteries.add(id);
    return id;
  }

  function arreter(id) {
    if (id === null) return;
    clearTimeout(id);
    minuteries.delete(id);
  }

  // --- Structure de l'écran ---

  const bandeau = el('p', { class: 'echauffement', hidden: true });
  const cartes = el('div', { class: 'cartes' });

  const note = el('p', { class: 'raison-notee', hidden: true });
  const raisons = el('div', { class: 'raisons', role: 'group', 'aria-labelledby': 'titre-raisons', hidden: true },
    el('p', { class: 'raisons-titre', id: 'titre-raisons' }, 'Pourquoi non ?'),
    el('div', { class: 'raisons-puces' },
      RAISONS.map((r) => el('button', {
        type: 'button', class: 'puce-raison', onclick: () => choisirRaison(r),
      }, LIBELLES_RAISONS[r]))));
  const pile = el('div', { class: 'pile' }, cartes, raisons, note);

  const bouton = (classe, libelle, glyphe, action) => el('button', {
    type: 'button', class: `action ${classe}`, 'aria-label': libelle, title: libelle, onclick: action,
  }, el('span', { 'aria-hidden': 'true' }, glyphe));
  const boutonNon = bouton('action-non', 'Non', '✕', () => agir('gauche'));
  const boutonAnnuler = bouton('action-annuler', 'Annuler le dernier swipe', '↶', () => annulerDernier());
  const boutonOui = bouton('action-oui', 'J\'aime', '♥︎', () => agir('droite'));
  const statut = el('p', { class: 'visuellement-cache', role: 'status', 'aria-live': 'polite' });

  conteneur.append(bandeau, pile, el('div', { class: 'actions-swipe' }, boutonNon, boutonAnnuler, boutonOui), statut);

  const annoncer = (texte) => { statut.textContent = texte; };

  function majBoutons() {
    const carte = !!carteActive;
    boutonNon.disabled = !carte;
    boutonOui.disabled = !carte;
    boutonAnnuler.disabled = !peutAnnuler();
  }

  // Affiché sur les cartes d'échauffement, puis encore (« 15/15 ») sur la première vraie carte,
  // jusqu'au premier vrai swipe.
  function majBandeau() {
    const fait = echauffementFait();
    const termineJuste = fait >= SEUIL_ECHAUFFEMENT && vraisSwipes() === 0;
    if (carteActive && (carteActive.entree.echauffement || termineJuste)) {
      bandeau.textContent = `Échauffement : ${Math.min(fait, SEUIL_ECHAUFFEMENT)}/${SEUIL_ECHAUFFEMENT}`;
      bandeau.hidden = false;
    } else {
      bandeau.hidden = true;
    }
  }

  // Textes de la pile vide du moment (clé refusée, pile indisponible ou plus de cartes).
  const textesVide = () => textesPileVide({ cleRefusee: cleRefusee(), indisponible: indisponible() });
  const BOUTONS_VIDE = {
    reglages: [auReglages, 'Ouvrir les Réglages'],
    reessayer: [auReessayer, 'Réessayer'],
    elargir: [auElargir, 'Élargir mes critères'],
  };
  let actionVide = null; // action de la pile vide affichée (null : une carte est affichée)

  function pileVide() {
    const { titre, aide, action } = textesVide();
    const [rappel, libelle] = BOUTONS_VIDE[action];
    actionVide = action;
    return el('div', { class: 'pile-vide' },
      el('p', { class: 'pile-vide-titre' }, titre),
      el('p', { class: 'aide' }, aide),
      rappel
        ? el('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => rappel() }, libelle)
        : null);
  }

  // Le statut de la synchronisation change après le dessin (clé refusée découverte ensuite) :
  // la pile vide est redessinée si son message n'est plus le bon.
  function auChangementSynchro() {
    if (detruit || carteActive || actionVide === null) return;
    if (textesVide().action !== actionVide) cartes.replaceChildren(pileVide());
  }
  window.addEventListener('sd:synchro', auChangementSynchro);

  // Recalcule la suite (profil et swipes à jour) et dessine la carte du dessus et celle d'après.
  // `idEnTete` : carte à garder devant si elle est encore dans la suite (celle qui était
  // déjà visible derrière, ou celle que l'on vient de faire revenir avec ↶).
  function dessiner(idEnTete) {
    const entrees = garderEnTete(suivantes(), idEnTete);
    const [dessus, derriere] = entrees;
    pile.style.removeProperty('--progres');
    cartes.replaceChildren();
    carteActive = null;
    actionVide = null;
    if (dessus) {
      if (derriere) cartes.append(construireCarte(derriere, false));
      const noeud = construireCarte(dessus, true);
      cartes.append(noeud);
      carteActive = { noeud, entree: dessus, idDerriere: derriere?.carte.id };
      brancherGeste(noeud);
    } else {
      cartes.append(pileVide());
    }
    auDessus(dessus?.carte.id ?? null);
    majBandeau();
    majBoutons();
  }

  // --- Position de la carte pendant le geste ---

  function placer(noeud, dx, dy) {
    noeud.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${rotation(dx)}deg)`;
    noeud.style.setProperty('--teinte', String(intensite(dx)));
    noeud.classList.toggle('vers-droite', dx > 0);
    noeud.classList.toggle('vers-gauche', dx < 0);
    pile.style.setProperty('--progres', String(intensite(dx)));
  }

  function revenir(noeud) {
    noeud.classList.remove('en-main', 'vers-droite', 'vers-gauche');
    noeud.style.removeProperty('transform');
    noeud.style.removeProperty('--teinte');
    pile.style.removeProperty('--progres');
  }

  function basculerDescription(noeud) {
    noeud.classList.toggle('ouverte');
  }

  function brancherGeste(noeud) {
    let geste = null;

    noeud.addEventListener('pointerdown', (e) => {
      if (verrou || geste || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // Note : la description ouverte défile au doigt (touch-action: pan-y) ; un défilement
      // vertical y déclenche pointercancel, et la carte revient simplement en place.
      geste = { id: e.pointerId, x0: e.clientX, y0: e.clientY, glisse: false, echantillons: [{ x: e.clientX, t: e.timeStamp }] };
      try {
        noeud.setPointerCapture(e.pointerId);
      } catch {
        // Capture impossible (pointeur déjà relâché) : le geste se termine quand même par pointerup.
      }
      noeud.classList.add('en-main');
    });

    noeud.addEventListener('pointermove', (e) => {
      if (!geste || e.pointerId !== geste.id) return;
      const dx = e.clientX - geste.x0;
      const dy = e.clientY - geste.y0;
      geste.echantillons.push({ x: e.clientX, t: e.timeStamp });
      if (geste.echantillons.length > MAX_ECHANTILLONS) geste.echantillons.shift();
      if (!geste.glisse && !estUnTap(dx, dy)) geste.glisse = true;
      if (geste.glisse) placer(noeud, dx, dy);
    });

    const finir = (e, annule) => {
      if (!geste || e.pointerId !== geste.id) return;
      const g = geste;
      geste = null;
      if (noeud.classList.contains('sortie')) return; // déjà partie (bouton ou clavier pendant le glissé)
      if (annule || verrou) {
        revenir(noeud);
        return;
      }
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      g.echantillons.push({ x: e.clientX, t: e.timeStamp });
      if (!g.glisse && estUnTap(dx, dy)) {
        revenir(noeud);
        basculerDescription(noeud);
        return;
      }
      const sens = decisionSwipe(dx, vitesseX(g.echantillons));
      if (sens) {
        noeud.classList.remove('en-main');
        agir(sens, { dy });
      } else {
        revenir(noeud);
      }
    };

    noeud.addEventListener('pointerup', (e) => finir(e, false));
    noeud.addEventListener('pointercancel', (e) => finir(e, true));
    noeud.addEventListener('lostpointercapture', (e) => finir(e, true));
    noeud.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        basculerDescription(noeud);
      }
    });
  }

  // --- Actions (gestes, boutons et clavier passent tous par ici) ---

  function agir(sens, { dy = 0 } = {}) {
    if (verrou || detruit || !carteActive) return;
    const { noeud, entree, idDerriere } = carteActive;
    verrou = true;
    cacherRaisons();
    // Enregistré tout de suite : quitter l'écran pendant l'animation ne perd pas le swipe.
    auSwipe(entree, sens);
    // Si l'écran est quitté pendant l'animation, c'est la carte d'après qui sera sur le dessus au retour.
    auDessus(idDerriere ?? null);
    // Les cartes d'échauffement aimées ne vont pas dans les favoris.
    if (sens === 'droite') annoncer(entree.echauffement ? 'Noté.' : 'Ajouté aux favoris.');
    else annoncer('Carte écartée.');
    const proposerRaison = sens === 'gauche' && !entree.echauffement;
    const suite = () => {
      verrou = false;
      dessiner(idDerriere);
      if (proposerRaison) montrerRaisons(entree.carte.id);
    };
    if (mouvementReduit()) {
      suite();
      return;
    }
    const signe = sens === 'droite' ? 1 : -1;
    const loin = (window.innerWidth || 400) + 200;
    noeud.classList.add('sortie', sens === 'droite' ? 'vers-droite' : 'vers-gauche');
    noeud.style.setProperty('--teinte', '1');
    noeud.style.transform = `translate(${signe * loin}px, ${dy * 0.3}px) rotate(${signe * 30}deg)`;
    pile.style.setProperty('--progres', '1');
    boutonNon.disabled = true;
    boutonOui.disabled = true;
    boutonAnnuler.disabled = true;
    minuterie(suite, DUREE_SORTIE);
  }

  function annulerDernier() {
    if (verrou || detruit || !peutAnnuler()) return;
    cacherRaisons();
    const dernier = auAnnuler();
    if (!dernier) {
      majBoutons();
      return;
    }
    annoncer('Dernier swipe annulé.');
    dessiner(dernier.id);
    if (carteActive?.entree.carte.id !== dernier.id || mouvementReduit()) return;
    const classe = dernier.sens === 'droite' ? 'retour-droite' : 'retour-gauche';
    const { noeud } = carteActive;
    verrou = true;
    noeud.classList.add(classe);
    minuterie(() => {
      verrou = false;
      noeud.classList.remove(classe);
    }, DUREE_SORTIE);
  }

  // --- Raison du refus ---

  function montrerRaisons(id) {
    arreter(minuterieRaisons);
    note.hidden = true;
    raisonsPour = id;
    raisons.hidden = false;
    minuterieRaisons = minuterie(cacherRaisons, DUREE_RAISONS);
  }

  function cacherRaisons() {
    arreter(minuterieRaisons);
    minuterieRaisons = null;
    raisonsPour = null;
    raisons.hidden = true;
    note.hidden = true;
  }

  function choisirRaison(raison) {
    if (!raisonsPour || detruit) return;
    const id = raisonsPour;
    cacherRaisons();
    auRaison(id, raison);
    note.textContent = `Noté : ${LIBELLES_RAISONS[raison]}`;
    note.hidden = false;
    annoncer(`Raison notée : ${LIBELLES_RAISONS[raison]}.`);
    minuterieRaisons = minuterie(cacherRaisons, DUREE_NOTE);
  }

  // --- Clavier : flèches gauche / droite ---

  function auClavier(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]')) return;
    // Flèche maintenue : un seul swipe (sinon toute la pile défile tant que la touche reste enfoncée).
    if (e.repeat) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      agir('gauche');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      agir('droite');
    }
  }
  document.addEventListener('keydown', auClavier);

  dessiner(idDessus);

  return function nettoyer() {
    detruit = true;
    document.removeEventListener('keydown', auClavier);
    window.removeEventListener('sd:synchro', auChangementSynchro);
    for (const id of minuteries) clearTimeout(id);
    minuteries.clear();
  };
}

// --- Bandeau « récolte » (recolte.json du dépôt privé, seulement avec une clé) ---

/**
 * Bandeau discret en haut de l'écran de swipe quand la récolte du PC est bloquée, en erreur,
 * en retard ou attend le profil. Mis à jour à chaque événement « sd:synchro » (sans redessiner
 * les cartes). Renvoie la fonction de nettoyage.
 */
function monterBandeauRecolte(parent, { etat, synchro } = {}) {
  const bandeau = el('p', { class: 'bandeau-recolte', role: 'status', hidden: true });
  parent.append(bandeau);
  const maj = () => {
    const message = synchro?.cleEnregistree?.() ? messageRecolte(etat?.synchro?.recolte, new Date()) : null;
    // Réécrit seulement si le texte change : role=status ne le réannonce pas à chaque synchro.
    if (bandeau.textContent !== (message ?? '')) bandeau.textContent = message ?? '';
    bandeau.hidden = !message;
    bandeau.classList.toggle('bandeau-recolte-info', message === MESSAGES_RECOLTE.attenteProfil);
  };
  maj();
  window.addEventListener('sd:synchro', maj);
  return () => window.removeEventListener('sd:synchro', maj);
}

// --- Écran « swipe » ---

enregistrerEcran('swipe', (conteneur, donnees) => {
  const section = el('section', { class: 'swipe', 'aria-labelledby': 'titre-swipe' },
    el('h1', { id: 'titre-swipe', class: 'visuellement-cache', tabindex: '-1' }, 'Swipe'));
  conteneur.append(section);
  const nettoyerBandeau = monterBandeauRecolte(section, donnees);
  // Avant l'arrivée de la pile : écran d'attente léger (main.js redessine l'écran ensuite).
  if (!donnees.chargee) {
    section.append(el('p', { class: 'chargement', role: 'status' }, 'Chargement…'));
    return nettoyerBandeau;
  }
  const nettoyerPile = monterPile(section, {
    suivantes: donnees.suivantes,
    auSwipe: donnees.auSwipe,
    auAnnuler: donnees.auAnnuler,
    auRaison: donnees.auRaison,
    peutAnnuler: donnees.peutAnnuler,
    echauffementFait: donnees.echauffementFait,
    vraisSwipes: donnees.vraisSwipes,
    auElargir: donnees.auElargir,
    indisponible: donnees.indisponible,
    auReessayer: donnees.auReessayer,
    cleRefusee: donnees.cleRefusee,
    auReglages: donnees.auReglages,
    idDessus: donnees.idDessus,
    auDessus: donnees.auDessus,
  });
  return () => {
    nettoyerBandeau();
    nettoyerPile();
  };
});
