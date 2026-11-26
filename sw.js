// Service worker de Swipe Dressing : l'appli reste utilisable hors connexion.
// VERSION est changée automatiquement par deploy.ps1 à chaque mise en ligne :
// c'est ce changement qui fait récupérer la mise à jour aux téléphones.
const VERSION = 'swipe-dressing-20261127-001757';
const PREFIXE = 'swipe-dressing-';

// Coquille de l'appli : servie depuis le cache d'abord.
// Tout nouveau fichier js/*.js ou data/demo/*.svg doit être ajouté ici
// (tests/sw.test.js échoue sinon, pour qu'aucun fichier ne soit oublié).
const COQUILLE = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/ecrans.js',
  'js/empreintes.js',
  'js/fiche.js',
  'js/formulaire.js',
  'js/geste.js',
  'js/hors-connexion.js',
  'js/listes-ui.js',
  'js/main.js',
  'js/paquet.js',
  'js/pile.js',
  'js/store.js',
  'js/swipe-ui.js',
  'js/synchro.js',
  'js/tailles.js',
  // Photos de la démonstration
  'data/demo/bonnet-workwear.svg',
  'data/demo/casquette-sportswear.svg',
  'data/demo/casquette-streetwear.svg',
  'data/demo/ceinture-chic.svg',
  'data/demo/ceinture-workwear.svg',
  'data/demo/chaussure-chic.svg',
  'data/demo/chaussure-minimaliste.svg',
  'data/demo/chaussure-sportswear.svg',
  'data/demo/chaussure-streetwear.svg',
  'data/demo/chaussure-vintage.svg',
  'data/demo/chaussure-workwear.svg',
  'data/demo/echarpe-chic.svg',
  'data/demo/echarpe-minimaliste.svg',
  'data/demo/gants-vintage.svg',
  'data/demo/gants-workwear.svg',
  'data/demo/jupe-chic.svg',
  'data/demo/jupe-minimaliste.svg',
  'data/demo/pantalon-chic.svg',
  'data/demo/pantalon-minimaliste.svg',
  'data/demo/pantalon-sportswear.svg',
  'data/demo/pantalon-streetwear.svg',
  'data/demo/pantalon-vintage.svg',
  'data/demo/pantalon-workwear.svg',
  'data/demo/pull-chic.svg',
  'data/demo/pull-minimaliste.svg',
  'data/demo/pull-sportswear.svg',
  'data/demo/pull-streetwear.svg',
  'data/demo/pull-vintage.svg',
  'data/demo/pull-workwear.svg',
  'data/demo/robe-chic.svg',
  'data/demo/robe-vintage.svg',
  'data/demo/sac-chic.svg',
  'data/demo/sac-minimaliste.svg',
  'data/demo/sac-sportswear.svg',
  'data/demo/sac-streetwear.svg',
  'data/demo/sac-vintage.svg',
  'data/demo/sac-workwear.svg',
  'data/demo/short-sportswear.svg',
  'data/demo/short-streetwear.svg',
  'data/demo/tshirt-chic.svg',
  'data/demo/tshirt-minimaliste.svg',
  'data/demo/tshirt-sportswear.svg',
  'data/demo/tshirt-streetwear.svg',
  'data/demo/tshirt-vintage.svg',
  'data/demo/veste-chic.svg',
  'data/demo/veste-minimaliste.svg',
  'data/demo/veste-sportswear.svg',
  'data/demo/veste-streetwear.svg',
  'data/demo/veste-vintage.svg',
  'data/demo/veste-workwear.svg',
];

// Données (data/*.json) : réseau d'abord, cache ensuite. Mises en cache dès l'installation
// pour que les cartes soient swipables hors connexion même après un seul chargement.
const DONNEES = [
  'data/demo-pile.json',
];

const FICHIERS = [...COQUILLE, ...DONNEES];
const ESSAIS = 3;
const TELECHARGEMENTS_SIMULTANES = 6;
const DELAI_RESEAU = 5000; // ms : au-delà, la copie en cache des données est servie

// Télécharge (sans passer par le cache HTTP du navigateur) les fichiers absents du cache
// de cette version, avec plusieurs essais chacun. Renvoie la liste des fichiers manquants.
async function remplirCache() {
  const cache = await caches.open(VERSION);
  const aFaire = [...FICHIERS];
  const manquants = [];
  async function telecharger() {
    while (aFaire.length > 0) {
      const fichier = aFaire.shift();
      if (await cache.match(fichier)) continue;
      let ok = false;
      for (let essai = 0; essai < ESSAIS && !ok; essai++) {
        try {
          const reponse = await fetch(new Request(fichier, { cache: 'reload' }));
          if (reponse.ok) {
            await cache.put(fichier, reponse);
            ok = true;
          }
        } catch {
          // Réseau coupé ou instable : on réessaie.
        }
      }
      if (!ok) manquants.push(fichier);
    }
  }
  await Promise.all(Array.from({ length: TELECHARGEMENTS_SIMULTANES }, telecharger));
  return manquants;
}

// Installation d'un bloc : s'il manque un seul fichier, l'installation échoue
// et l'ancienne version (complète) reste en place.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const manquants = await remplirCache();
    if (manquants.length > 0) throw new Error(`Fichiers manquants : ${manquants.join(', ')}`);
    await self.skipWaiting();
  })());
});

// Activation : les anciens caches de Swipe Dressing ne sont supprimés qu'une fois le nouveau
// complet. Les caches des autres applis du même domaine (même compte GitHub Pages) ne sont
// jamais touchés.
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const manquants = await remplirCache();
    if (manquants.length === 0) {
      const cles = await caches.keys();
      await Promise.all(
        cles.filter((k) => k.startsWith(PREFIXE) && k !== VERSION).map((k) => caches.delete(k)),
      );
    }
    await self.clients.claim();
  })());
});

// La page demande, à chaque ouverture, de compléter le cache : une autre appli du même
// domaine a pu le vider.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'verifier-cache') e.waitUntil(remplirCache());
});

const sansRecherche = (url) => url.split(/[?#]/)[0];

// Données : réseau d'abord (toujours la dernière pile), copie en cache si pas de réseau
// ou réseau trop lent.
async function reseauDabord(e) {
  const cache = await caches.open(VERSION);
  const cle = sansRecherche(e.request.url);
  const reseau = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((reponse) => {
    if (reponse.ok) return cache.put(cle, reponse.clone()).then(() => reponse, () => reponse);
    return reponse;
  });
  const delai = new Promise((resoudre) => setTimeout(resoudre, DELAI_RESEAU, null));
  try {
    const reponse = await Promise.race([reseau, delai]);
    if (reponse?.ok) return reponse;
    if (reponse) {
      // Erreur HTTP (404, 500…) : la copie en cache vaut mieux, sinon on renvoie l'erreur.
      return (await cache.match(cle)) ?? (await caches.match(cle)) ?? reponse;
    }
  } catch {
    // Hors connexion.
  }
  const enCache = (await cache.match(cle)) ?? (await caches.match(cle));
  if (enCache) {
    e.waitUntil(reseau.catch(() => {}));
    return enCache;
  }
  return reseau; // ni cache ni réseau rapide : on attend le réseau (ou son erreur)
}

// Coquille : cache d'abord, réseau sinon (et la réponse est gardée pour la prochaine fois).
async function cacheDabord(e) {
  const requete = e.request;
  const cache = await caches.open(VERSION);
  const enCache = (await cache.match(requete, { ignoreSearch: true }))
    ?? (await caches.match(requete, { ignoreSearch: true })); // une autre version, faute de mieux
  if (enCache) return enCache;
  try {
    const reponse = await fetch(requete);
    if (reponse.ok && reponse.type === 'basic') {
      e.waitUntil(cache.put(sansRecherche(requete.url), reponse.clone()).catch(() => {}));
    }
    return reponse;
  } catch (erreur) {
    if (requete.mode === 'navigate') {
      const accueil = (await cache.match('index.html')) ?? (await caches.match(new URL('index.html', self.registration.scope).href));
      if (accueil) return accueil;
    }
    throw erreur;
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const portee = new URL(self.registration.scope);
  // Seulement les fichiers de l'appli (pas les autres applis du même domaine, ni les autres sites).
  if (url.origin !== portee.origin || !url.pathname.startsWith(portee.pathname)) return;
  const chemin = url.pathname.slice(portee.pathname.length);
  if (/^data\/.+\.json$/.test(chemin)) e.respondWith(reseauDabord(e));
  else e.respondWith(cacheDabord(e));
});
