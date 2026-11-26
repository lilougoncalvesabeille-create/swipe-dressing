import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  messageRecolte, MESSAGES_RECOLTE, recolteEnRetard, texteEtatSynchro, retourCle, problemeSaisieCle,
  ETAPES_CLE, CLE_REFUSEE, MODE_DEMO,
} from '../js/synchro.js';
import { ilYA, textesPileVide } from '../js/fiche.js';

const MAINTENANT = new Date('2026-11-25T12:00:00Z');
const ilYAH = (h) => new Date(MAINTENANT.getTime() - h * 3600_000).toISOString();
const recolte = (statut, dernier = ilYAH(2)) => ({ dernier_passage: dernier, statut, message: '', nouvelles: 3 });

// --- Bandeau de l'écran de swipe ---

test('messageRecolte : un texte par statut, exactement ceux du brief', () => {
  assert.equal(messageRecolte(recolte('bloque'), MAINTENANT), 'Vinted a bloqué la dernière récolte, nouvel essai plus tard.');
  assert.equal(messageRecolte(recolte('erreur'), MAINTENANT), 'La dernière récolte a échoué.');
  assert.equal(messageRecolte(recolte('attente-profil'), MAINTENANT),
    'Le PC attend ton profil : il arrivera à la prochaine synchronisation.');
  assert.equal(messageRecolte(recolte('ok', ilYAH(25)), MAINTENANT),
    'Pas de nouvelle récolte depuis plus d\'un jour : le PC est-il allumé ?');
});

test('messageRecolte : null quand tout va bien ou sans recolte.json', () => {
  assert.equal(messageRecolte(recolte('ok'), MAINTENANT), null);
  assert.equal(messageRecolte(recolte('ok', ilYAH(23.9)), MAINTENANT), null);
  assert.equal(messageRecolte(recolte('ok', ilYAH(24)), MAINTENANT), null); // 24 h pile : pas encore en retard
  assert.equal(messageRecolte(null, MAINTENANT), null);
  assert.equal(messageRecolte(undefined, MAINTENANT), null);
  assert.equal(messageRecolte('ok', MAINTENANT), null);
  assert.equal(messageRecolte([], MAINTENANT), null);
});

test('messageRecolte : plus de 24 h, ou date absente ou illisible → « le PC est-il allumé ? »', () => {
  assert.equal(messageRecolte(recolte('ok', ilYAH(24.01)), MAINTENANT), MESSAGES_RECOLTE.retard);
  assert.equal(messageRecolte(recolte('ok', ilYAH(24 * 7)), MAINTENANT), MESSAGES_RECOLTE.retard);
  assert.equal(messageRecolte(recolte('ok', null), MAINTENANT), MESSAGES_RECOLTE.retard);
  assert.equal(messageRecolte(recolte('ok', 'hier'), MAINTENANT), MESSAGES_RECOLTE.retard);
  assert.equal(messageRecolte({ statut: 'ok' }, MAINTENANT), MESSAGES_RECOLTE.retard);
});

test('messageRecolte : bloqué ou en erreur l\'emporte sur l\'ancienneté, l\'ancienneté sur l\'attente du profil', () => {
  assert.equal(messageRecolte(recolte('bloque', ilYAH(48)), MAINTENANT), MESSAGES_RECOLTE.bloque);
  assert.equal(messageRecolte(recolte('erreur', ilYAH(48)), MAINTENANT), MESSAGES_RECOLTE.erreur);
  assert.equal(messageRecolte(recolte('attente-profil', ilYAH(30)), MAINTENANT), MESSAGES_RECOLTE.retard);
});

test('messageRecolte : une date dans le futur (horloge décalée) n\'est pas un retard', () => {
  assert.equal(messageRecolte(recolte('ok', ilYAH(-3)), MAINTENANT), null);
});

test('messageRecolte suit recolteEnRetard (l\'attente du profil en plus)', () => {
  const cas = [
    recolte('ok'), recolte('ok', ilYAH(30)), recolte('bloque'), recolte('erreur'), recolte('ok', 'illisible'),
    recolte('attente-profil'), recolte('inconnu'), null,
  ];
  for (const r of cas) {
    const message = messageRecolte(r, MAINTENANT);
    const attendu = recolteEnRetard(r, MAINTENANT);
    if (r?.statut === 'attente-profil' && !attendu) assert.equal(message, MESSAGES_RECOLTE.attenteProfil);
    else assert.equal(message !== null, attendu, JSON.stringify(r));
  }
});

// --- Réglages → « Synchronisation » ---

test('texteEtatSynchro : lignes d\'état du brief', () => {
  assert.equal(texteEtatSynchro('ok'), 'Connecté au dépôt privé');
  assert.equal(texteEtatSynchro('cle-refusee'),
    'Clé refusée : vérifie qu\'elle donne accès à swipe-dressing-donnees (Contents : lecture et écriture)');
  assert.equal(texteEtatSynchro('hors-ligne'), 'Hors connexion');
  assert.equal(texteEtatSynchro('sans-cle'), 'Mode démo : ajoute ta clé pour recevoir de vraies annonces.');
  assert.equal(MODE_DEMO, texteEtatSynchro('sans-cle'));
  assert.equal(texteEtatSynchro('en-cours'), 'Synchronisation…');
  assert.equal(texteEtatSynchro('pret'), 'Synchronisation…');
  assert.match(texteEtatSynchro('erreur'), /impossible/);
  assert.equal(texteEtatSynchro('statut-inconnu'), texteEtatSynchro('erreur'));
});

test('retourCle : clé valide, enregistrée ou seulement testée', () => {
  assert.deepEqual(retourCle({ ok: true, raison: 'ok', message: 'Clé valide.', enregistree: true }),
    { texte: 'Connecté au dépôt privé', detail: 'Clé enregistrée.', erreur: false });
  assert.deepEqual(retourCle({ ok: true, raison: 'ok', message: 'Clé valide.' }),
    { texte: 'Connecté au dépôt privé', detail: null, erreur: false });
});

test('retourCle : clé refusée ou sans accès → « Clé refusée… », pas enregistrée', () => {
  for (const raison of ['cle', 'acces']) {
    const r = retourCle({ ok: false, raison, message: 'Clé refusée par GitHub.', enregistree: false });
    assert.equal(r.texte, CLE_REFUSEE);
    assert.equal(r.detail, 'Clé refusée par GitHub. Elle n’a pas été enregistrée.');
    assert.equal(r.erreur, true);
  }
  // Test d'une clé déjà enregistrée (pas de champ enregistree) : rien sur l'enregistrement.
  assert.equal(retourCle({ ok: false, raison: 'cle', message: 'Refusée.' }).detail, 'Refusée.');
});

test('retourCle : sans réseau, la clé est gardée et le dit', () => {
  const r = retourCle({ ok: false, raison: 'reseau', message: 'Pas de connexion à GitHub.', enregistree: true });
  assert.equal(r.texte, 'Hors connexion');
  assert.equal(r.detail, 'Pas de connexion à GitHub. La clé est enregistrée : elle sera essayée plus tard.');
  const g = retourCle({ ok: false, raison: 'github', message: 'Erreur 502.', enregistree: true });
  assert.match(g.texte, /GitHub ne répond pas/);
  assert.match(g.detail, /enregistrée/);
  assert.equal(retourCle(null).erreur, true);
});

test('retourCle : saisie vide ou avec un espace → son message, jamais « Clé refusée »', () => {
  const r = retourCle({ ok: false, raison: 'saisie', message: 'Colle d’abord la clé GitHub.', enregistree: false });
  assert.deepEqual(r, { texte: 'Colle d’abord la clé GitHub.', detail: null, erreur: true });
});

test('problemeSaisieCle : vide, espaces au milieu ; espaces autour acceptés', () => {
  assert.match(problemeSaisieCle(''), /Colle/);
  assert.match(problemeSaisieCle('   \n'), /Colle/);
  assert.match(problemeSaisieCle(null), /Colle/);
  assert.match(problemeSaisieCle('github_pat_ab cd'), /espace/);
  assert.match(problemeSaisieCle('github_pat_ab\ncd'), /espace/);
  assert.equal(problemeSaisieCle('  github_pat_abcdef\n'), null);
});

test('pas-à-pas : 6 étapes avec les noms exacts de github.com', () => {
  assert.equal(ETAPES_CLE.length, 6);
  const tout = ETAPES_CLE.join('\n');
  for (const nom of [
    'Settings', 'Developer settings', 'Personal access tokens', 'Fine-grained tokens', 'Generate new token',
    'Repository access', 'Only select repositories', 'swipe-dressing-donnees', 'Permissions', 'Contents : Read and write',
    '1 an',
  ]) assert.ok(tout.includes(nom), `${nom} absent du pas-à-pas`);
  assert.ok(tout.indexOf('Developer settings') < tout.indexOf('Fine-grained tokens'));
});

// --- Temps écoulé (« il y a X h ») ---

test('ilYA : minutes, heures, jours', () => {
  const avant = (ms) => new Date(MAINTENANT.getTime() - ms).toISOString();
  assert.equal(ilYA(avant(20_000), MAINTENANT), 'à l’instant');
  assert.equal(ilYA(avant(60_000), MAINTENANT), 'il y a 1 min');
  assert.equal(ilYA(avant(59 * 60_000), MAINTENANT), 'il y a 59 min');
  assert.equal(ilYA(avant(60 * 60_000), MAINTENANT), 'il y a 1 h');
  assert.equal(ilYA(avant(23.9 * 3600_000), MAINTENANT), 'il y a 23 h');
  assert.equal(ilYA(avant(24 * 3600_000), MAINTENANT), 'il y a 1 jour');
  assert.equal(ilYA(avant(3.5 * 24 * 3600_000), MAINTENANT), 'il y a 3 jours');
});

test('ilYA : null si absente ou illisible ; futur → « à l\'instant »', () => {
  assert.equal(ilYA(null, MAINTENANT), null);
  assert.equal(ilYA('', MAINTENANT), null);
  assert.equal(ilYA('pas une date', MAINTENANT), null);
  assert.equal(ilYA(42, MAINTENANT), null);
  assert.equal(ilYA('2026-11-25T13:00:00Z', MAINTENANT), 'à l’instant');
});

// --- La clé n'est jamais lue ni affichée par les écrans ---

test('les écrans ne lisent jamais la clé : seulement synchro.finCle()', () => {
  for (const fichier of ['js/ecrans.js', 'js/swipe-ui.js', 'js/listes-ui.js']) {
    const texte = readFileSync(fichier, 'utf8');
    assert.ok(!texte.includes('sd:cle'), `${fichier} cite sd:cle`);
    assert.ok(!/localStorage|lireCle|console\.(log|info|debug)/.test(texte), `${fichier} lit le stockage ou journalise`);
  }
  const ecrans = readFileSync('js/ecrans.js', 'utf8');
  // Le champ est un mot de passe sans saisie automatique, vidé dès sa lecture.
  assert.match(ecrans, /type: 'password', id: 'sync-cle', autocomplete: 'off'/);
  assert.match(ecrans, /type: 'password', id: 'relier-cle', autocomplete: 'off'/);
  assert.match(ecrans, /const saisie = champ\.value;\s*champ\.value = '';/);
  assert.match(ecrans, /const saisie = champCle\.value;\s*champCle\.value = '';/);
  // La seule partie montrée est la fin rendue par finCle(), précédée de « … ».
  assert.match(ecrans, /`Clé enregistrée : …\$\{fin\}`/);
  assert.ok(!/champCle\.value\s*=\s*[^'\s]/.test(ecrans), 'le champ de la clé est rempli par le code');
});

// --- Écran de swipe sans carte ---

test("textesPileVide : clé refusée → « vérifie-la dans Réglages », elle l'emporte sur la pile indisponible", () => {
  const refusee = textesPileVide({ cleRefusee: true, indisponible: true });
  assert.equal(refusee.titre, 'Ta clé GitHub a été refusée : vérifie-la dans Réglages.');
  assert.equal(refusee.action, 'reglages');
  assert.equal(textesPileVide({ cleRefusee: true }).action, 'reglages');
  assert.ok(!/connexion/i.test(refusee.titre + refusee.aide));
});

test('textesPileVide : pile indisponible et plus de cartes gardent les textes de la phase 1', () => {
  assert.deepEqual(textesPileVide({ indisponible: true }), {
    titre: "Annonces indisponibles pour l'instant.", aide: 'Vérifie ta connexion puis réessaie.', action: 'reessayer',
  });
  const vide = textesPileVide();
  assert.equal(vide.titre, "Plus de cartes pour l'instant");
  assert.equal(vide.action, 'elargir');
});
