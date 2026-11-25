// Stockage clé/valeur JSON au-dessus de localStorage, avec repli en mémoire.
// Module pur (sans DOM) : utilisable dans le navigateur et dans Node.

function stockageParDefaut() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * options.critiques : clés dont un échec d'écriture rend le store « non persistant »
 * (par défaut, toutes). Une écriture réussie de la même clé efface son échec.
 */
export function creerStore(stockage = stockageParDefaut(), { critiques = null } = {}) {
  const memoire = new Map();
  const disque = stockage ?? null;
  let lectureCassee = false;
  const enEchec = new Set(); // clés dont la dernière écriture a été refusée
  const critique = (cle) => critiques === null || critiques.includes(cle);

  // En repli, la mémoire (valeurs les plus récentes) prime, puis on relit le stockage
  // d'origine tant qu'il répond : les données déjà enregistrées ne disparaissent pas.
  function lire(cle, defaut = null) {
    let brut = memoire.has(cle) ? memoire.get(cle) : null;
    if (brut === null && disque && !lectureCassee) {
      try {
        brut = disque.getItem(cle);
      } catch {
        lectureCassee = true;
      }
    }
    if (brut === null || brut === undefined) return defaut;
    try {
      return JSON.parse(brut);
    } catch {
      return defaut;
    }
  }

  // Chaque écriture tente d'abord le vrai stockage : un refus (quota) ne pénalise que cette clé.
  function ecrire(cle, valeur) {
    const brut = JSON.stringify(valeur);
    if (disque && !lectureCassee) {
      try {
        disque.setItem(cle, brut);
        memoire.delete(cle);
        enEchec.delete(cle);
        return true;
      } catch {
        enEchec.add(cle);
      }
    }
    memoire.set(cle, brut);
    return false;
  }

  return {
    lire,
    ecrire,
    get persistant() {
      return disque !== null && !lectureCassee && ![...enEchec].some(critique);
    },
  };
}
