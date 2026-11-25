// Empreintes d'images (FashionCLIP) : encodage compact, similarité, classement, profil de style.

function normaliser(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}

export function encoderEmb(vec) {
  const n = normaliser(vec);
  const octets = new Int8Array(n.length);
  for (let i = 0; i < n.length; i++) {
    octets[i] = Math.max(-127, Math.min(127, Math.round(n[i] * 127)));
  }
  let bin = '';
  for (const o of new Uint8Array(octets.buffer)) bin += String.fromCharCode(o);
  return btoa(bin);
}

export function decoderEmb(b64) {
  const bin = atob(b64);
  const octets = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = (bin.charCodeAt(i) << 24) >> 24;
  return normaliser(octets);
}

// Cache des empreintes décodées (id → {b64, emb}) : une même carte n'est décodée qu'une fois
// tant que la pile ne change pas (main.js le vide à chaque nouvelle pile). L'empreinte en base64
// est comparée : un id dont l'empreinte a changé est décodé de nouveau.
const cacheEmpreintes = new Map();

export function empreinteDe(id, b64) {
  const connue = cacheEmpreintes.get(id);
  if (connue && connue.b64 === b64) return connue.emb;
  const emb = decoderEmb(b64);
  cacheEmpreintes.set(id, { b64, emb });
  return emb;
}

export function viderCacheEmpreintes() {
  cacheEmpreintes.clear();
}

// 0 si les dimensions diffèrent (pile de la phase 2 en 512 contre démo en 8) ou si un vecteur est vide.
export function cosinus(a, b) {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  const d = Math.sqrt(aa) * Math.sqrt(bb);
  return d === 0 ? 0 : ab / d;
}

function moyenneTop3(emb, refs) {
  if (refs.length === 0) return 0;
  const sims = refs.map((r) => cosinus(emb, r)).sort((x, y) => y - x).slice(0, 3);
  return sims.reduce((s, x) => s + x, 0) / sims.length;
}

export function scoreCarte(emb, aimes, refuses) {
  return moyenneTop3(emb, aimes) - 0.5 * moyenneTop3(emb, refuses);
}

export function scoreFinal(entree, aimes, refuses) {
  return scoreCarte(entree.emb, aimes, refuses) - (entree.voisine ? 0.05 : 0);
}

export function reclasser(entrees, aimes, refuses, partExploration, rng) {
  if (aimes.length === 0) {
    const m = [...entrees];
    for (let i = m.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [m[i], m[j]] = [m[j], m[i]];
    }
    return m;
  }
  const restantes = entrees
    .map((e) => ({ e, s: scoreFinal(e, aimes, refuses) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.e);
  const resultat = [];
  while (restantes.length > 0) {
    const n = restantes.length;
    let idx = 0;
    if (rng() < partExploration) idx = Math.floor(n / 2) + Math.floor(rng() * Math.ceil(n / 2));
    resultat.push(restantes.splice(idx, 1)[0]);
  }
  return resultat;
}

export function profilStyle(aimes, styles) {
  if (aimes.length === 0 || styles.length === 0) return [];
  const votes = styles.map(() => 0);
  for (const emb of aimes) {
    let meilleur = 0;
    let max = -Infinity;
    styles.forEach((s, i) => {
      const c = cosinus(emb, s.emb);
      if (c > max) { max = c; meilleur = i; }
    });
    votes[meilleur]++;
  }
  const total = aimes.length;
  const parts = votes.map((v, i) => {
    const exact = (v * 100) / total;
    return { i, nom: styles[i].nom, pct: Math.floor(exact), reste: exact - Math.floor(exact) };
  });
  let manque = 100 - parts.reduce((s, p) => s + p.pct, 0);
  [...parts].sort((x, y) => y.reste - x.reste || x.i - y.i).forEach((p) => {
    if (manque > 0 && votes[p.i] > 0) { p.pct++; manque--; }
  });
  return parts
    .filter((p) => p.pct > 0)
    .sort((x, y) => y.pct - x.pct || x.i - y.i)
    .map(({ nom, pct }) => ({ nom, pct }));
}
