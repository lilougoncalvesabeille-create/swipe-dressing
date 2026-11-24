// Enregistre le service worker (sw.js) pour que l'appli s'installe et marche hors connexion.
// Module sans effet à l'import : main.js l'appelle, les tests lui passent de faux objets.

export function enregistrerServiceWorker(nav = globalThis.navigator, loc = globalThis.location) {
  // Pas de service worker sans le navigateur qui le permet, ni pour un fichier ouvert en local.
  if (!nav || !('serviceWorker' in nav)) return null;
  if (!loc || loc.protocol === 'file:') return null;
  return nav.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then(async (inscription) => {
      // Une autre appli du même domaine (même compte GitHub Pages) a pu vider nos caches :
      // le service worker complète ce qui manque.
      const actif = (await nav.serviceWorker.ready)?.active;
      actif?.postMessage({ type: 'verifier-cache' });
      return inscription;
    })
    .catch((erreur) => {
      console.warn('Mode hors connexion indisponible', erreur);
      return null;
    });
}
