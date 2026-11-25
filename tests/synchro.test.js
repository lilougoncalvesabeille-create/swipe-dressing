import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPOT, creerClient, ErreurCle, ErreurConflit, ErreurReseau,
  versSwipesJson, depuisSwipesJson, fusionnerDistant, envoyerSwipes, envoyerProfil,
  importerDistants, recolteEnRetard,
} from '../js/synchro.js';

const CLE = 'github_pat_CLE_SECRETE_123';
const URL_BASE = `https://api.github.com/repos/${DEPOT}/contents/`;

// Encode un texte en base64 UTF-8, coupé en lignes de 60 caractères comme le fait GitHub.
function base64Utf8(texte) {
  let bin = '';
  for (const o of new TextEncoder().encode(texte)) bin += String.fromCharCode(o);
  return btoa(bin).replace(/.{60}/g, '$&\n');
}
function decoderBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const reponse = (status, { json, texte, entetes = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (n) => entetes[n.toLowerCase()] ?? null },
  json: async () => (json !== undefined ? json : JSON.parse(texte)),
  text: async () => (texte !== undefined ? texte : JSON.stringify(json)),
});

// Faux fetch : enregistre chaque requête et répond avec `gerer(requete)`.
function fauxFetch(gerer) {
  const requetes = [];
  const fetch = async (url, init = {}) => {
    const requete = { url, init, methode: init.method ?? 'GET', entetes: { ...(init.headers ?? {}) }, corps: init.body };
    requetes.push(requete);
    return gerer(requete);
  };
  return { fetch, requetes };
}

// Faux dépôt GitHub : fichiers avec SHA, conflits forcés sur demande.
function fauxDepot(fichiers = {}) {
  const etat = { fichiers: { ...fichiers }, conflits: 0, n: 0 };
  const faux = fauxFetch((r) => {
    const nom = r.url.slice(URL_BASE.length);
    const fichier = etat.fichiers[nom];
    if (r.methode === 'GET') {
      if (!fichier) return reponse(404, { json: { message: 'Not Found' } });
      return reponse(200, { json: { sha: fichier.sha, encoding: 'base64', content: base64Utf8(fichier.texte) } });
    }
    const corps = JSON.parse(r.corps);
    if (etat.conflits > 0) {
      etat.conflits--;
      // Une autre copie a écrit entre-temps.
      const autre = etat.autreEcriture?.();
      if (autre) etat.fichiers[nom] = { texte: JSON.stringify(autre), sha: `sha-autre-${etat.n++}` };
      return reponse(409, { json: { message: 'conflict' } });
    }
    if ((fichier?.sha ?? undefined) !== corps.sha) return reponse(409, { json: { message: 'sha' } });
    const sha = `sha-${etat.n++}`;
    etat.fichiers[nom] = { texte: decoderBase64Utf8(corps.content), sha };
    return reponse(fichier ? 200 : 201, { json: { content: { sha } } });
  });
  return { ...faux, etat };
}

// Toutes les requêtes ne portent la clé que dans l'en-tête Authorization.
function verifierCleCachee(requetes) {
  assert.ok(requetes.length > 0);
  for (const r of requetes) {
    assert.ok(r.url.startsWith('https://api.github.com/'), r.url);
    assert.ok(!r.url.includes(CLE), 'clé dans l\'URL');
    assert.ok(!String(r.corps ?? '').includes(CLE), 'clé dans le corps');
    assert.equal(r.entetes.Authorization, `Bearer ${CLE}`);
    for (const [nom, valeur] of Object.entries(r.entetes)) {
      if (nom !== 'Authorization') assert.ok(!String(valeur).includes(CLE), `clé dans l'en-tête ${nom}`);
    }
  }
}

const sw = (id, t, extra = {}) => ({ id, sens: 'droite', t, ...extra });
const objet = (swipes = [], extra = {}) => ({
  version: 1, swipes, annules: [], remis_a_zero: null, echauffement_faits: 0, ...extra,
});

// --- Client ---

test('le dépôt privé est fixé dans le code', () => {
  assert.equal(DEPOT, 'lilougoncalvesabeille-create/swipe-dressing-donnees');
});

test('lire : contenu base64 décodé en UTF-8 (accents), avec le SHA', async () => {
  const texte = JSON.stringify({ titre: 'Pull à capuche été — très bon état', prix: 12.5, liste: Array(30).fill('é') });
  const { fetch, requetes } = fauxFetch(() => reponse(200, {
    json: { sha: 'abc', encoding: 'base64', content: base64Utf8(texte) },
  }));
  const r = await creerClient({ cle: CLE, fetch }).lire('pile.json');
  assert.deepEqual(r, { json: JSON.parse(texte), sha: 'abc' });
  assert.equal(requetes.length, 1);
  assert.equal(requetes[0].url, `${URL_BASE}pile.json`);
  assert.equal(requetes[0].entetes.Accept, 'application/vnd.github+json');
  verifierCleCachee(requetes);
});

test('lire : contenu vide (fichier de plus de 1 Mo) → relecture en brut', async () => {
  const texte = JSON.stringify({ version: 1, cartes: [{ titre: 'Écharpe' }] });
  const { fetch, requetes } = fauxFetch((r) => (r.entetes.Accept === 'application/vnd.github.raw+json'
    ? reponse(200, { texte })
    : reponse(200, { json: { sha: 'gros', encoding: 'none', content: '', size: 2_000_000 } })));
  const r = await creerClient({ cle: CLE, fetch }).lire('pile.json');
  assert.deepEqual(r, { json: JSON.parse(texte), sha: 'gros' });
  assert.equal(requetes.length, 2);
  assert.equal(requetes[1].url, `${URL_BASE}pile.json`);
  verifierCleCachee(requetes);
});

test('lire : 404 → null ; contenu illisible → json null', async () => {
  const absent = fauxFetch(() => reponse(404, { json: { message: 'Not Found' } }));
  assert.equal(await creerClient({ cle: CLE, fetch: absent.fetch }).lire('recolte.json'), null);
  const casse = fauxFetch(() => reponse(200, { json: { sha: 's', encoding: 'base64', content: base64Utf8('{pas du json') } }));
  assert.deepEqual(await creerClient({ cle: CLE, fetch: casse.fetch }).lire('swipes.json'), { json: null, sha: 's' });
});

test('401 et 403 → ErreurCle, sans la clé dans le message', async () => {
  for (const status of [401, 403]) {
    const { fetch } = fauxFetch(() => reponse(status, { json: { message: 'Bad credentials' } }));
    await assert.rejects(creerClient({ cle: CLE, fetch }).lire('pile.json'), (e) => {
      assert.ok(e instanceof ErreurCle);
      assert.ok(!e.message.includes(CLE));
      return true;
    });
  }
});

test('403 de limite de requêtes → ErreurReseau (la clé n\'est pas en cause)', async () => {
  const { fetch } = fauxFetch(() => reponse(403, { json: {}, entetes: { 'x-ratelimit-remaining': '0' } }));
  await assert.rejects(creerClient({ cle: CLE, fetch }).lire('pile.json'), ErreurReseau);
});

test('réseau coupé ou erreur serveur → ErreurReseau, sans la clé dans le message', async () => {
  const coupe = fauxFetch(() => { throw new TypeError(`Failed to fetch (Bearer ${CLE})`); });
  await assert.rejects(creerClient({ cle: CLE, fetch: coupe.fetch }).lire('pile.json'), (e) => {
    assert.ok(e instanceof ErreurReseau);
    assert.ok(!e.message.includes(CLE));
    assert.ok(!String(e.cause ?? '').includes(CLE));
    return true;
  });
  const panne = fauxFetch(() => reponse(502, { json: {} }));
  await assert.rejects(creerClient({ cle: CLE, fetch: panne.fetch }).lire('pile.json'), ErreurReseau);
});

test('ecrire : PUT en base64 UTF-8 avec le SHA ; 409 et 422 → ErreurConflit', async () => {
  const { fetch, requetes } = fauxFetch(() => reponse(200, { json: { content: { sha: 'nouveau' } } }));
  const client = creerClient({ cle: CLE, fetch });
  const r = await client.ecrire('profil.json', { ville: 'Besançon' }, 'ancien', 'Téléphone : profil');
  assert.deepEqual(r, { sha: 'nouveau' });
  assert.equal(requetes[0].methode, 'PUT');
  assert.equal(requetes[0].url, `${URL_BASE}profil.json`);
  const corps = JSON.parse(requetes[0].corps);
  assert.equal(corps.sha, 'ancien');
  assert.equal(corps.message, 'Téléphone : profil');
  assert.deepEqual(JSON.parse(decoderBase64Utf8(corps.content)), { ville: 'Besançon' });
  verifierCleCachee(requetes);

  await client.ecrire('nouveau.json', {}, undefined, 'm');
  assert.ok(!('sha' in JSON.parse(requetes[1].corps)));

  for (const status of [409, 422]) {
    const conflit = fauxFetch(() => reponse(status, { json: {} }));
    await assert.rejects(creerClient({ cle: CLE, fetch: conflit.fetch }).ecrire('swipes.json', {}, 'x', 'm'), ErreurConflit);
  }
});

test('tester : ok, clé refusée, dépôt inaccessible, hors connexion', async () => {
  const ok = fauxFetch(() => reponse(200, { json: { full_name: DEPOT } }));
  const r = await creerClient({ cle: CLE, fetch: ok.fetch }).tester();
  assert.equal(r.ok, true);
  assert.equal(ok.requetes[0].url, `https://api.github.com/repos/${DEPOT}`);
  verifierCleCachee(ok.requetes);
  for (const [faux, motif] of [
    [() => reponse(401, { json: {} }), /refus/i],
    [() => reponse(404, { json: {} }), /accès/i],
    [() => reponse(403, { json: {} }), /accès|droits/i],
    [() => { throw new TypeError('offline'); }, /connexion/i],
  ]) {
    const f = fauxFetch(faux);
    const res = await creerClient({ cle: CLE, fetch: f.fetch }).tester();
    assert.equal(res.ok, false);
    assert.match(res.message, motif);
    assert.ok(!res.message.includes(CLE));
  }
});

// --- Format de swipes.json ---

test('versSwipesJson : format compact, sans carte ni empreinte, sans la démo', () => {
  const swipes = [
    { id: 'demo:1', sens: 'droite', t: '2026-01-01T00:00:00.000Z', echauffement: true, carte: {}, emb: 'AA==' },
    { id: 'vinted:1', sens: 'gauche', raison: 'prix', echauffement: true, t: '2026-01-02T00:00:00.000Z', carte: { titre: 'x' }, emb: 'AA==' },
    { id: 'vinted:2', sens: 'gauche', raison: null, echauffement: false, t: '2026-01-03T00:00:00.000Z', carte: {}, emb: 'AA==' },
    {
      id: 'vinted:3', sens: 'droite', raison: null, repeche: true, repeche_le: '2026-01-05T00:00:00.000Z',
      t: '2026-01-04T00:00:00.000Z', carte: {},
    },
  ];
  const annules = [{ id: 'vinted:9', t: '2026-01-06T00:00:00.000Z' }, { id: 'demo:2', t: '2026-01-06T00:00:00.000Z' }];
  const o = versSwipesJson(swipes, annules, '2025-12-31T00:00:00.000Z');
  assert.deepEqual(o, {
    version: 1,
    swipes: [
      { id: 'vinted:1', sens: 'gauche', t: '2026-01-02T00:00:00.000Z', raison: 'prix' },
      { id: 'vinted:2', sens: 'gauche', t: '2026-01-03T00:00:00.000Z' },
      { id: 'vinted:3', sens: 'droite', t: '2026-01-04T00:00:00.000Z', repeche_le: '2026-01-05T00:00:00.000Z' },
    ],
    annules: [{ id: 'vinted:9', t: '2026-01-06T00:00:00.000Z' }],
    remis_a_zero: '2025-12-31T00:00:00.000Z',
    echauffement_faits: 1,
  });
  assert.deepEqual(versSwipesJson([], [], null), objet());
});

test('depuisSwipesJson : lecture tolérante', () => {
  const o = objet([sw('a', '2026-01-01T00:00:00Z'), { id: 3 }, null, sw('b', '2026-01-02T00:00:00Z', { sens: 'haut' })], {
    annules: [{ id: 'z', t: '2026-01-03T00:00:00Z' }, { t: 'x' }],
    remis_a_zero: '2025-01-01T00:00:00Z',
    echauffement_faits: 4,
  });
  assert.deepEqual(depuisSwipesJson(o), {
    swipes: [sw('a', '2026-01-01T00:00:00Z')],
    annules: [{ id: 'z', t: '2026-01-03T00:00:00Z' }],
    remisAZero: '2025-01-01T00:00:00Z',
    echauffementFaits: 4,
  });
  assert.deepEqual(depuisSwipesJson(null), { swipes: [], annules: [], remisAZero: null, echauffementFaits: 0 });
  assert.deepEqual(depuisSwipesJson('texte').swipes, []);
});

// --- Fusion avec la version distante ---

test('fusionnerDistant : union par id, le plus récent gagne (t ou repeche_le)', () => {
  const local = objet([sw('a', '2026-01-01T00:00:00Z', { sens: 'gauche' }), sw('b', '2026-01-02T00:00:00Z')]);
  const distant = objet([
    sw('a', '2026-01-01T00:00:00Z', { sens: 'droite', repeche_le: '2026-01-04T00:00:00Z' }),
    sw('c', '2026-01-03T00:00:00Z'),
  ]);
  const f = fusionnerDistant(local, distant);
  assert.deepEqual(f.swipes.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(f.swipes[0].sens, 'droite');
  assert.equal(f.swipes[0].repeche_le, '2026-01-04T00:00:00Z');
  assert.deepEqual(fusionnerDistant(distant, local).swipes, f.swipes);
});

test('fusionnerDistant : annulation après le swipe → retiré ; reswipe après l\'annulation → présent', () => {
  const distant = objet([sw('a', '2026-01-01T00:00:00Z'), sw('b', '2026-01-01T00:00:00Z')]);
  const local = objet([sw('b', '2026-01-03T00:00:00Z', { sens: 'gauche' })], {
    annules: [{ id: 'a', t: '2026-01-02T00:00:00Z' }, { id: 'b', t: '2026-01-02T00:00:00Z' }],
  });
  const f = fusionnerDistant(local, distant);
  assert.deepEqual(f.swipes.map((s) => s.id), ['b']);
  assert.equal(f.swipes[0].sens, 'gauche');
  assert.deepEqual(f.annules.map((a) => a.id).sort(), ['a', 'b']);
  // Les annulations des deux côtés sont réunies, la plus récente par id.
  const f2 = fusionnerDistant(objet([], { annules: [{ id: 'a', t: '2026-01-05T00:00:00Z' }] }), f);
  assert.equal(f2.annules.find((x) => x.id === 'a').t, '2026-01-05T00:00:00Z');
});

test('fusionnerDistant : le remis_a_zero le plus récent masque ce qui est antérieur', () => {
  const distant = objet([sw('a', '2026-01-01T00:00:00Z'), sw('b', '2026-01-05T00:00:00Z')], {
    annules: [{ id: 'z', t: '2026-01-02T00:00:00Z' }], echauffement_faits: 15,
  });
  const local = objet([], { remis_a_zero: '2026-01-03T00:00:00Z' });
  const f = fusionnerDistant(local, distant);
  assert.equal(f.remis_a_zero, '2026-01-03T00:00:00Z');
  assert.deepEqual(f.swipes.map((s) => s.id), ['b']);
  assert.deepEqual(f.annules, []);
  assert.equal(fusionnerDistant(distant, local).remis_a_zero, '2026-01-03T00:00:00Z');
  // Tout effacer : la remise à zéro vide aussi le compte d'échauffement.
  const efface = fusionnerDistant(objet([], { remis_a_zero: '2026-02-01T00:00:00Z' }), distant);
  assert.deepEqual(efface, objet([], { remis_a_zero: '2026-02-01T00:00:00Z' }));
});

test('fusionnerDistant : echauffement_faits vient du côté à l\'activité la plus récente', () => {
  const ancien = objet([sw('a', '2026-01-01T00:00:00Z')], { echauffement_faits: 3 });
  const recent = objet([sw('b', '2026-01-02T00:00:00Z')], { echauffement_faits: 7 });
  assert.equal(fusionnerDistant(ancien, recent).echauffement_faits, 7);
  assert.equal(fusionnerDistant(recent, ancien).echauffement_faits, 7);
  // Une annulation compte comme une activité.
  const annule = objet([], { annules: [{ id: 'b', t: '2026-01-03T00:00:00Z' }], echauffement_faits: 6 });
  assert.equal(fusionnerDistant(annule, recent).echauffement_faits, 6);
  // Après une remise à zéro, les valeurs d'avant sont ignorées.
  const remis = objet([], { remis_a_zero: '2026-01-05T00:00:00Z' });
  assert.equal(fusionnerDistant(remis, recent).echauffement_faits, 0);
  const apres = objet([sw('c', '2026-01-06T00:00:00Z')], { echauffement_faits: 1, remis_a_zero: '2026-01-05T00:00:00Z' });
  assert.equal(fusionnerDistant(recent, apres).echauffement_faits, 1);
});

// --- Envoi ---

test('envoyerSwipes : un 409 puis un succès → 2 lectures, 2 écritures, swipes des deux côtés', async () => {
  const depot = fauxDepot({ 'swipes.json': { texte: JSON.stringify(objet([sw('distant:1', '2026-01-01T00:00:00Z')])), sha: 's0' } });
  depot.etat.conflits = 1;
  depot.etat.autreEcriture = () => objet([sw('distant:1', '2026-01-01T00:00:00Z'), sw('distant:2', '2026-01-02T00:00:00Z')]);
  const client = creerClient({ cle: CLE, fetch: depot.fetch });
  const local = objet([sw('local:1', '2026-01-03T00:00:00Z')], { echauffement_faits: 2 });
  const r = await envoyerSwipes(client, local);
  const lectures = depot.requetes.filter((q) => q.methode === 'GET');
  const ecritures = depot.requetes.filter((q) => q.methode === 'PUT');
  assert.equal(lectures.length, 2);
  assert.equal(ecritures.length, 2);
  assert.equal(r.envoye, true);
  const final = JSON.parse(depot.etat.fichiers['swipes.json'].texte);
  assert.deepEqual(final.swipes.map((s) => s.id), ['distant:1', 'distant:2', 'local:1']);
  assert.deepEqual(r.objetFinal, final);
  assert.equal(final.echauffement_faits, 2);
  verifierCleCachee(depot.requetes);
});

test('envoyerSwipes : crée le fichier absent, n\'écrit rien si rien ne change, abandonne après les essais', async () => {
  const depot = fauxDepot();
  const client = creerClient({ cle: CLE, fetch: depot.fetch });
  const local = objet([sw('a', '2026-01-01T00:00:00Z')]);
  assert.equal((await envoyerSwipes(client, local)).envoye, true);
  assert.deepEqual(JSON.parse(depot.etat.fichiers['swipes.json'].texte), local);
  const avant = depot.requetes.length;
  const r = await envoyerSwipes(client, local);
  assert.equal(r.envoye, false);
  assert.equal(depot.requetes.length, avant + 1); // une seule lecture
  depot.etat.conflits = 5;
  await assert.rejects(envoyerSwipes(client, objet([sw('b', '2026-01-02T00:00:00Z')]), { essais: 3 }), ErreurConflit);
  assert.equal(depot.requetes.filter((q) => q.methode === 'PUT').length, 1 + 3);
});

test('envoyerProfil : écrit le profil avec le SHA, sans écraser un profil distant plus récent', async () => {
  const depot = fauxDepot({ 'profil.json': { texte: JSON.stringify({ version: 1, profil: { pays: 'FR' }, modifie_le: '2026-01-01T00:00:00Z' }), sha: 'p0' } });
  const client = creerClient({ cle: CLE, fetch: depot.fetch });
  const local = { version: 1, profil: { pays: 'BE' }, modifie_le: '2026-01-02T00:00:00Z' };
  assert.equal((await envoyerProfil(client, local)).envoye, true);
  assert.deepEqual(JSON.parse(depot.etat.fichiers['profil.json'].texte), local);
  const vieux = { version: 1, profil: { pays: 'CH' }, modifie_le: '2025-12-01T00:00:00Z' };
  assert.equal((await envoyerProfil(client, vieux)).envoye, false);
  assert.deepEqual(JSON.parse(depot.etat.fichiers['profil.json'].texte), local);
  verifierCleCachee(depot.requetes);
});

// --- Retour vers le téléphone ---

test('importerDistants : les swipes faits ailleurs sont ajoutés en tête, sans carte (jamais remontrés)', () => {
  const locaux = [{ id: 'a', sens: 'droite', t: '2026-01-02T00:00:00Z', carte: {}, emb: 'AA==' }];
  const final = objet([sw('b', '2026-01-01T00:00:00Z', { sens: 'gauche', raison: 'prix' }), sw('a', '2026-01-02T00:00:00Z')]);
  const r = importerDistants(locaux, final);
  assert.deepEqual(r.map((s) => s.id), ['b', 'a']);
  assert.deepEqual(r[0], { id: 'b', sens: 'gauche', t: '2026-01-01T00:00:00Z', raison: 'prix', distant: true });
  assert.equal(r[1], locaux[0]);
  assert.equal(importerDistants(locaux, objet([sw('a', '2026-01-02T00:00:00Z')])), locaux);
  assert.equal(importerDistants(locaux, null), locaux);
  // Envoi parti juste avant un « annuler » : la carte annulée ici n'est pas réimportée.
  const annules = [{ id: 'b', t: '2026-01-01T00:00:05Z' }];
  assert.equal(importerDistants(locaux, final, annules), locaux);
});

test('recolteEnRetard : bloquée, en erreur ou plus vieille que 24 h', () => {
  const maintenant = new Date('2026-01-02T12:00:00Z');
  const r = (statut, dernier) => recolteEnRetard({ statut, dernier_passage: dernier, message: '', nouvelles: 0 }, maintenant);
  assert.equal(r('ok', '2026-01-02T00:00:00Z'), false);
  assert.equal(r('bloque', '2026-01-02T00:00:00Z'), true);
  assert.equal(r('erreur', '2026-01-02T00:00:00Z'), true);
  assert.equal(r('ok', '2026-01-01T11:00:00Z'), true);
  assert.equal(r('ok', 'pas une date'), true);
  assert.equal(recolteEnRetard(null, maintenant), false);
});
