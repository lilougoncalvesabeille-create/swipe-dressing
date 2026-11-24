// Fait tourner sw.js dans un faux navigateur (caches, fetch, événements) pour vérifier
// l'installation d'un bloc, le nettoyage des caches et le fonctionnement hors connexion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const texteSw = readFileSync('sw.js', 'utf8');
const PORTEE = 'https://exemple.github.io/swipe-dressing/';
const absolue = (u) => new URL(u, PORTEE).href;
const sansRecherche = (u) => u.split(/[?#]/)[0];

class FausseReponse {
  constructor(corps, status = 200) {
    this.corps = corps;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.type = 'basic';
  }
  clone() { return new FausseReponse(this.corps, this.status); }
}

class FausseRequete {
  constructor(entree, options = {}) {
    this.url = absolue(typeof entree === 'string' ? entree : entree.url);
    this.method = 'GET';
    this.mode = options.mode ?? 'cors';
    this.cache = options.cache ?? 'default';
  }
}

class FauxCache {
  constructor() { this.entrees = new Map(); }
  cle(req, options) {
    const url = absolue(typeof req === 'string' ? req : req.url);
    return options?.ignoreSearch ? sansRecherche(url) : url;
  }
  async match(req, options) {
    const cle = this.cle(req, options);
    for (const [url, rep] of this.entrees) {
      if ((options?.ignoreSearch ? sansRecherche(url) : url) === cle) return rep.clone();
    }
    return undefined;
  }
  async put(req, rep) { this.entrees.set(this.cle(req), rep); }
}

function environnement({ reseau }) {
  const magasin = new Map();
  const ecouteurs = {};
  const appels = { skipWaiting: 0, fetch: [] };
  const caches = {
    async open(nom) {
      if (!magasin.has(nom)) magasin.set(nom, new FauxCache());
      return magasin.get(nom);
    },
    async keys() { return [...magasin.keys()]; },
    async delete(nom) { return magasin.delete(nom); },
    async match(req, options) {
      for (const c of magasin.values()) {
        const r = await c.match(req, options);
        if (r) return r;
      }
      return undefined;
    },
  };
  const self = {
    addEventListener: (type, f) => { ecouteurs[type] = f; },
    skipWaiting: async () => { appels.skipWaiting++; },
    clients: { claim: async () => {} },
    registration: { scope: PORTEE },
  };
  const fetch = async (entree) => {
    const url = absolue(typeof entree === 'string' ? entree : entree.url);
    appels.fetch.push(url);
    return reseau(url);
  };
  const minuteur = (f, ms, ...args) => setTimeout(f, ms, ...args).unref();
  runInNewContext(texteSw, {
    self, caches, fetch, Request: FausseRequete, URL, console, setTimeout: minuteur,
  });
  const version = texteSw.match(/const VERSION = '([^']*)';/)[1];

  async function evenementDeVie(type) {
    let promesse;
    ecouteurs[type]({ waitUntil: (p) => { promesse = p; } });
    return promesse;
  }

  // Renvoie undefined si le service worker laisse passer la requête.
  async function demander(url, mode = 'cors') {
    let reponse;
    const enAttente = [];
    ecouteurs.fetch({
      request: new FausseRequete(url, { mode }),
      respondWith: (p) => { reponse = p; },
      waitUntil: (p) => enAttente.push(p),
    });
    const r = await reponse;
    await Promise.all(enAttente);
    return r;
  }

  async function message(data) {
    let promesse;
    ecouteurs.message({ data, waitUntil: (p) => { promesse = p; } });
    return promesse;
  }

  return { magasin, appels, version, caches, evenementDeVie, demander, message };
}

const enLigne = (url) => new FausseReponse(`contenu de ${url}`);
const horsLigne = async () => { throw new TypeError('Failed to fetch'); };

test('installation : tout est mis en cache d\'un bloc, puis la nouvelle version prend la main', async () => {
  const env = environnement({ reseau: enLigne });
  await env.evenementDeVie('install');
  const cache = env.magasin.get(env.version);
  assert.ok(await cache.match('index.html'));
  assert.ok(await cache.match('js/main.js'));
  assert.ok(await cache.match('data/demo-pile.json'));
  assert.ok(await cache.match('./'));
  assert.equal(env.appels.skipWaiting, 1);
});

test('installation : un fichier introuvable fait échouer l\'installation (l\'ancienne version reste)', async () => {
  const env = environnement({
    reseau: (url) => (url.endsWith('js/geste.js') ? new FausseReponse('', 404) : enLigne(url)),
  });
  const ancien = await env.caches.open('swipe-dressing-ancien');
  await ancien.put('index.html', new FausseReponse('ancienne page'));
  await assert.rejects(env.evenementDeVie('install'), /js\/geste\.js/);
  assert.equal(env.appels.skipWaiting, 0);
  assert.ok(env.magasin.has('swipe-dressing-ancien'));
});

test('installation : un échec réseau passager est réessayé', async () => {
  let echecs = 0;
  const env = environnement({
    reseau: async (url) => {
      if (url.endsWith('app.css') && echecs < 2) { echecs++; throw new TypeError('coupure'); }
      return enLigne(url);
    },
  });
  await env.evenementDeVie('install');
  assert.ok(await env.magasin.get(env.version).match('app.css'));
});

test('activation : supprime les anciens caches de Swipe Dressing, jamais ceux des autres applis', async () => {
  const env = environnement({ reseau: enLigne });
  await env.caches.open('swipe-dressing-ancien');
  await env.caches.open('salle-de-jeux-20261123-060054');
  await env.evenementDeVie('install');
  await env.evenementDeVie('activate');
  assert.deepEqual((await env.caches.keys()).sort(), ['salle-de-jeux-20261123-060054', env.version].sort());
});

test('activation : si le nouveau cache est incomplet, l\'ancien est gardé', async () => {
  let coupe = false;
  const env = environnement({ reseau: (url) => (coupe ? horsLigne() : enLigne(url)) });
  await env.evenementDeVie('install');
  env.magasin.get(env.version).entrees.delete(absolue('app.css'));
  await env.caches.open('swipe-dressing-ancien');
  coupe = true;
  await env.evenementDeVie('activate');
  assert.ok(env.magasin.has('swipe-dressing-ancien'));
});

test('hors connexion : la page, les modules, les photos et la pile sont servis depuis le cache', async () => {
  let coupe = false;
  const env = environnement({ reseau: (url) => (coupe ? horsLigne() : enLigne(url)) });
  await env.evenementDeVie('install');
  await env.evenementDeVie('activate');
  coupe = true;
  for (const url of ['index.html', 'app.css', 'js/main.js', 'js/swipe-ui.js', 'data/demo/pull-chic.svg', 'icons/icon-192.png']) {
    const r = await env.demander(url);
    assert.equal(r?.corps, `contenu de ${absolue(url)}`, url);
  }
  assert.equal((await env.demander('./', 'navigate'))?.corps, `contenu de ${absolue('./')}`);
  assert.equal((await env.demander('./?source=pwa', 'navigate'))?.corps, `contenu de ${absolue('./')}`);
  assert.equal((await env.demander('data/demo-pile.json'))?.corps, `contenu de ${absolue('data/demo-pile.json')}`);
});

test('hors connexion : une page inconnue de l\'appli affiche l\'accueil en cache', async () => {
  let coupe = false;
  const env = environnement({ reseau: (url) => (coupe ? horsLigne() : enLigne(url)) });
  await env.evenementDeVie('install');
  coupe = true;
  const r = await env.demander('page-inconnue.html', 'navigate');
  assert.equal(r?.corps, `contenu de ${absolue('index.html')}`);
});

test('en ligne : la coquille vient du cache, sans réseau', async () => {
  const env = environnement({ reseau: enLigne });
  await env.evenementDeVie('install');
  const avant = env.appels.fetch.length;
  await env.demander('js/main.js');
  assert.equal(env.appels.fetch.length, avant);
});

test('en ligne : la pile vient du réseau et sa copie en cache est mise à jour', async () => {
  let version = 1;
  const env = environnement({ reseau: (url) => new FausseReponse(`${url} v${version}`) });
  await env.evenementDeVie('install');
  version = 2;
  const url = absolue('data/demo-pile.json');
  assert.equal((await env.demander('data/demo-pile.json')).corps, `${url} v2`);
  assert.equal((await env.magasin.get(env.version).match(url)).corps, `${url} v2`);
});

test('en ligne : une pile en erreur HTTP laisse place à la copie en cache', async () => {
  let panne = false;
  const env = environnement({ reseau: (url) => (panne ? new FausseReponse('', 500) : enLigne(url)) });
  await env.evenementDeVie('install');
  panne = true;
  const r = await env.demander('data/demo-pile.json');
  assert.equal(r.status, 200);
});

test('les fichiers hors de l\'appli (autre appli du domaine, autre site) ne passent pas par le service worker', async () => {
  const env = environnement({ reseau: enLigne });
  assert.equal(await env.demander('https://exemple.github.io/salle-de-jeux/index.html'), undefined);
  assert.equal(await env.demander('https://images.exemple.com/photo.jpg'), undefined);
});

test('verifier-cache complète un cache vidé par une autre appli du domaine', async () => {
  const env = environnement({ reseau: enLigne });
  await env.evenementDeVie('install');
  await env.caches.delete(env.version);
  await env.message({ type: 'verifier-cache' });
  const cache = env.magasin.get(env.version);
  assert.ok(await cache.match('index.html'));
  assert.ok(await cache.match('data/demo/pull-chic.svg'));
});

test('un autre message est ignoré', async () => {
  const env = environnement({ reseau: enLigne });
  assert.equal(await env.message({ type: 'autre' }), undefined);
  assert.equal(await env.message(null), undefined);
  assert.equal(env.appels.fetch.length, 0);
});
