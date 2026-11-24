import test from 'node:test';
import assert from 'node:assert/strict';

// Faux DOM minimal : juste ce qu'afficherEcran touche.
const conteneur = { dataset: {}, vides: 0, replaceChildren() { this.vides++; }, querySelector: () => null };
globalThis.document = {
  body: { dataset: {} },
  getElementById: (id) => (id === 'ecran' ? conteneur : null),
  querySelectorAll: () => [],
};
globalThis.window = { scrollTo() {} };

const { enregistrerEcran, afficherEcran } = await import('../js/ecrans.js');

test("afficherEcran appelle le nettoyage de l'écran précédent, une seule fois", () => {
  const journal = [];
  enregistrerEcran('test-a', () => {
    journal.push('rendu a');
    return () => journal.push('nettoyage a');
  });
  enregistrerEcran('test-b', () => { journal.push('rendu b'); });
  afficherEcran('test-a');
  assert.deepEqual(journal, ['rendu a']);
  afficherEcran('test-a'); // même écran redessiné : l'ancien rendu est nettoyé d'abord
  assert.deepEqual(journal, ['rendu a', 'nettoyage a', 'rendu a']);
  afficherEcran('test-b');
  afficherEcran('test-b'); // b ne renvoie rien : aucun nettoyage à appeler
  assert.deepEqual(journal, ['rendu a', 'nettoyage a', 'rendu a', 'nettoyage a', 'rendu b', 'rendu b']);
  assert.equal(conteneur.dataset.ecran, 'test-b');
  assert.equal(document.body.dataset.ecran, 'test-b');
});

test("un nettoyage qui plante n'empêche pas d'afficher l'écran suivant", (t) => {
  t.mock.method(console, 'error', () => {});
  let rendus = 0;
  enregistrerEcran('test-casse', () => () => { throw new Error('boum'); });
  enregistrerEcran('test-ok', () => { rendus++; });
  afficherEcran('test-casse');
  afficherEcran('test-ok');
  afficherEcran('test-ok');
  assert.equal(rendus, 2);
  assert.equal(console.error.mock.callCount(), 1);
});

test('écran inconnu : erreur, sans nettoyer l\'écran affiché', () => {
  let nettoye = 0;
  enregistrerEcran('test-c', () => () => { nettoye++; });
  afficherEcran('test-c');
  assert.throws(() => afficherEcran('nexiste-pas'), /écran inconnu/);
  assert.equal(nettoye, 0);
  afficherEcran('test-ok');
  assert.equal(nettoye, 1);
});
