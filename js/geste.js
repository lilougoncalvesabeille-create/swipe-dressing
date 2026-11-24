// Logique pure du geste de swipe (sans DOM) : vitesse, décision, rotation, teinte.
// swipe-ui.js lui passe les positions du doigt ; les tests Node la vérifient directement.

export const SEUIL_DISTANCE = 100; // px : au-delà, le swipe est validé
export const SEUIL_VITESSE = 0.5; // px/ms : un lancer plus rapide valide aussi le swipe
export const DISTANCE_LANCER_MIN = 24; // px : un lancer doit quand même déplacer un peu la carte
export const SEUIL_TAP = 8; // px : en dessous, le geste est un simple appui
export const FENETRE_VITESSE = 100; // ms : la vitesse se mesure sur la fin du geste

/**
 * Vitesse horizontale (px/ms) sur les derniers `fenetre` ms du geste.
 * echantillons : [{x, t}] dans l'ordre chronologique.
 */
export function vitesseX(echantillons, fenetre = FENETRE_VITESSE) {
  if (!Array.isArray(echantillons) || echantillons.length < 2) return 0;
  const dernier = echantillons.at(-1);
  let premier = dernier;
  for (let i = echantillons.length - 2; i >= 0; i--) {
    if (dernier.t - echantillons[i].t > fenetre) break;
    premier = echantillons[i];
  }
  const dt = dernier.t - premier.t;
  return dt > 0 ? (dernier.x - premier.x) / dt : 0;
}

/**
 * Sens du swipe à la fin du geste : 'droite', 'gauche' ou null (la carte revient).
 * dx : déplacement horizontal total ; vx : vitesse horizontale finale.
 */
export function decisionSwipe(dx, vx) {
  if (!Number.isFinite(dx)) return null;
  if (Math.abs(dx) >= SEUIL_DISTANCE) return dx > 0 ? 'droite' : 'gauche';
  if (Number.isFinite(vx) && Math.abs(vx) > SEUIL_VITESSE && Math.abs(dx) >= DISTANCE_LANCER_MIN
    && Math.sign(vx) === Math.sign(dx)) {
    return dx > 0 ? 'droite' : 'gauche';
  }
  return null;
}

// Un appui sans glisser (sous SEUIL_TAP) n'est pas un swipe : il ouvre la description.
export function estUnTap(dx, dy) {
  return Math.hypot(dx, dy) < SEUIL_TAP;
}

// Rotation légère de la carte pendant le glissé (degrés), bornée à ±25°.
export function rotation(dx) {
  return Math.max(-25, Math.min(25, dx / 20));
}

// Intensité de la teinte verte / rouge (0 à 1), pleine au seuil de validation.
export function intensite(dx) {
  return Math.min(1, Math.abs(dx) / SEUIL_DISTANCE);
}
