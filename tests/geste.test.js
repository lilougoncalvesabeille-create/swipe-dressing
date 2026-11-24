import test from 'node:test';
import assert from 'node:assert/strict';
import { proche } from './aide.js';
import {
  vitesseX, decisionSwipe, estUnTap, rotation, intensite,
  SEUIL_DISTANCE, SEUIL_VITESSE,
} from '../js/geste.js';

test('vitesseX : mesurée sur la fin du geste', () => {
  assert.equal(vitesseX([]), 0);
  assert.equal(vitesseX([{ x: 0, t: 0 }]), 0);
  assert.equal(vitesseX([{ x: 0, t: 5 }, { x: 40, t: 5 }]), 0);
  proche(vitesseX([{ x: 0, t: 0 }, { x: 50, t: 50 }, { x: 100, t: 100 }]), 1);
  // Le début lent (plus de 100 ms avant la fin) est ignoré.
  const lentPuisRapide = [{ x: 0, t: 0 }, { x: 5, t: 300 }, { x: 45, t: 340 }, { x: 85, t: 380 }];
  proche(vitesseX(lentPuisRapide), 1);
  proche(vitesseX([{ x: 100, t: 0 }, { x: 40, t: 60 }]), -1);
});

test('decisionSwipe : seuil de 100 px', () => {
  assert.equal(decisionSwipe(SEUIL_DISTANCE, 0), 'droite');
  assert.equal(decisionSwipe(-SEUIL_DISTANCE, 0), 'gauche');
  assert.equal(decisionSwipe(250, -0.1), 'droite');
  assert.equal(decisionSwipe(99, 0), null);
  assert.equal(decisionSwipe(-99, 0.2), null);
  assert.equal(decisionSwipe(0, 0), null);
  assert.equal(decisionSwipe(Number.NaN, 2), null);
});

test('decisionSwipe : lancer rapide sous le seuil', () => {
  assert.equal(decisionSwipe(40, SEUIL_VITESSE + 0.1), 'droite');
  assert.equal(decisionSwipe(-40, -(SEUIL_VITESSE + 0.1)), 'gauche');
  assert.equal(decisionSwipe(40, SEUIL_VITESSE), null, 'il faut dépasser 0,5 px/ms');
  assert.equal(decisionSwipe(40, -1.5), null, 'lancé dans l\'autre sens : la carte revient');
  assert.equal(decisionSwipe(10, 3), null, 'trop petit déplacement');
});

test('estUnTap, rotation, intensite', () => {
  assert.equal(estUnTap(0, 0), true);
  assert.equal(estUnTap(5, 5), true);
  assert.equal(estUnTap(8, 0), false);
  assert.equal(estUnTap(0, -20), false);
  assert.equal(rotation(0), 0);
  assert.equal(rotation(100), 5);
  assert.equal(rotation(-60), -3);
  assert.equal(rotation(5000), 25);
  assert.equal(rotation(-5000), -25);
  assert.equal(intensite(0), 0);
  assert.equal(intensite(-50), 0.5);
  assert.equal(intensite(400), 1);
});
