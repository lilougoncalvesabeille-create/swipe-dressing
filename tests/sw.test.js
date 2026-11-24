import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';
import { enregistrerServiceWorker } from '../js/hors-connexion.js';

const texteSw = readFileSync('sw.js', 'utf8');

// Lit la liste `const NOM = [ ... ];` de sw.js comme du texte.
function listeDuSw(nom) {
  const bloc = texteSw.match(new RegExp(`const ${nom} = \\[([\\s\\S]*?)\\];`));
  assert.ok(bloc, `liste ${nom} introuvable dans sw.js`);
  return [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const coquille = listeDuSw('COQUILLE');
const donnees = listeDuSw('DONNEES');
const tout = [...coquille, ...donnees];

const fichiersDe = (dossier, extension) =>
  readdirSync(dossier).filter((f) => f.endsWith(extension)).map((f) => `${dossier}/${f}`);

test('sw.js est du JavaScript valide', () => {
  assert.doesNotThrow(() => new Script(texteSw));
});

test('la VERSION du cache a la forme que deploy.ps1 sait réécrire', () => {
  assert.match(texteSw, /const VERSION = 'swipe-dressing-[^']*';/);
  assert.equal(texteSw.match(/const VERSION = '[^']*';/g).length, 1);
});

test('chaque module js/*.js est dans le cache', () => {
  for (const f of fichiersDe('js', '.js')) assert.ok(coquille.includes(f), `${f} absent de COQUILLE dans sw.js`);
});

test('chaque photo data/demo/*.svg est dans le cache', () => {
  const svgs = fichiersDe('data/demo', '.svg');
  assert.ok(svgs.length > 0);
  for (const f of svgs) assert.ok(coquille.includes(f), `${f} absent de COQUILLE dans sw.js`);
});

test('chaque fichier data/*.json est dans les données (réseau d\'abord)', () => {
  for (const f of fichiersDe('data', '.json')) assert.ok(donnees.includes(f), `${f} absent de DONNEES dans sw.js`);
});

test('la page, le style, le manifeste et les icônes sont dans le cache', () => {
  for (const f of ['./', 'index.html', 'app.css', 'manifest.webmanifest', ...fichiersDe('icons', '.png')]) {
    assert.ok(coquille.includes(f), `${f} absent de COQUILLE dans sw.js`);
  }
  assert.equal(fichiersDe('icons', '.png').length, 3);
});

test('chaque fichier de la liste existe (sinon l\'installation échouerait) et n\'y est qu\'une fois', () => {
  for (const f of tout) if (f !== './') assert.ok(existsSync(f), `${f} listé dans sw.js mais introuvable`);
  assert.equal(new Set(tout).size, tout.length, 'doublon dans la liste de sw.js');
});

test('le manifeste décrit une appli installable', () => {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(m.name, 'Swipe Dressing');
  assert.equal(m.short_name, 'Swipe');
  assert.equal(m.lang, 'fr');
  assert.equal(m.start_url, './index.html');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#0f1419');
  assert.equal(m.background_color, '#0f1419');
  const tailles = m.icons.map((i) => i.sizes).sort();
  assert.deepEqual(tailles, ['192x192', '512x512']);
  for (const i of m.icons) {
    assert.ok(existsSync(i.src), `${i.src} introuvable`);
    assert.equal(i.purpose, 'any maskable');
  }
});

test('index.html relie le manifeste et l\'icône Apple', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180.png">/);
  assert.match(html, /<meta name="theme-color" content="#0f1419">/);
});

test('les icônes sont des PNG aux bonnes dimensions', () => {
  for (const n of [180, 192, 512]) {
    const png = readFileSync(`icons/icon-${n}.png`);
    assert.equal(png.toString('latin1', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), n); // largeur (en-tête IHDR)
    assert.equal(png.readUInt32BE(20), n); // hauteur
  }
});

// --- Enregistrement du service worker ---

function fauxNavigateur() {
  const appels = { register: [], messages: [] };
  const actif = { postMessage: (m) => appels.messages.push(m) };
  return {
    appels,
    serviceWorker: {
      register: async (url, options) => {
        appels.register.push({ url, options });
        return { scope: './' };
      },
      ready: Promise.resolve({ active: actif }),
    },
  };
}

test('enregistre sw.js puis demande de compléter le cache', async () => {
  const nav = fauxNavigateur();
  const inscription = await enregistrerServiceWorker(nav, { protocol: 'https:' });
  assert.deepEqual(inscription, { scope: './' });
  assert.deepEqual(nav.appels.register, [{ url: 'sw.js', options: { updateViaCache: 'none' } }]);
  assert.deepEqual(nav.appels.messages, [{ type: 'verifier-cache' }]);
});

test('n\'enregistre rien sans service worker ou pour un fichier local', () => {
  assert.equal(enregistrerServiceWorker({}, { protocol: 'https:' }), null);
  assert.equal(enregistrerServiceWorker(undefined, { protocol: 'https:' }), null);
  const nav = fauxNavigateur();
  assert.equal(enregistrerServiceWorker(nav, { protocol: 'file:' }), null);
  assert.equal(nav.appels.register.length, 0);
});

test('un refus d\'enregistrement ne casse pas l\'appli', async () => {
  const avertir = console.warn;
  console.warn = () => {};
  try {
    const nav = { serviceWorker: { register: () => Promise.reject(new Error('refusé')) } };
    assert.equal(await enregistrerServiceWorker(nav, { protocol: 'https:' }), null);
  } finally {
    console.warn = avertir;
  }
});
