// Stockage clé/valeur JSON au-dessus de localStorage, avec repli en mémoire.
// Module pur (sans DOM) : utilisable dans le navigateur et dans Node.

function stockageParDefaut() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function creerStore(stockage = stockageParDefaut()) {
  const memoire = new Map();
  let actif = stockage ?? null;

  function basculer() {
    actif = null;
  }

  const store = {
    get persistant() {
      return actif !== null;
    },

    lire(cle, defaut = null) {
      let brut = null;
      if (actif) {
        try {
          brut = actif.getItem(cle);
        } catch {
          basculer();
        }
      }
      if (!actif) brut = memoire.has(cle) ? memoire.get(cle) : null;
      if (brut === null || brut === undefined) return defaut;
      try {
        return JSON.parse(brut);
      } catch {
        return defaut;
      }
    },

    ecrire(cle, valeur) {
      const brut = JSON.stringify(valeur);
      if (actif) {
        try {
          actif.setItem(cle, brut);
          return true;
        } catch {
          basculer();
        }
      }
      memoire.set(cle, brut);
      return false;
    },
  };
  return store;
}
