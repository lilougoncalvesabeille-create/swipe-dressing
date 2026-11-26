# Format de la pile

Contrat entre le récolteur (phase 2) et l'application. La pile est un fichier JSON
(`data/demo-pile.json` pour la démo), validé par `validerPile` dans `js/pile.js`.

```
{ "version": 1, "genere_le": "ISO-8601", "source": "demo"|"pc"|"actions",
  "styles":       [ {"nom": "streetwear", "emb": "<base64 int8>"} , … ],
  "echauffement": [ Carte, … ],
  "cartes":       [ Carte, … ] }
Carte = { "id": "vinted:123", "site": "vinted"|"emmaus"|"zalando"|"veepee"|"demo",
  "titre": str, "description": str, "prix": number (euros), "categorie": clé de CATEGORIES,
  "rayon": "homme"|"femme"|"mixte"|null (facultatif),
  "marque": str|null, "etat": "neuf-etiquette"|"neuf"|"tres-bon"|"bon"|"satisfaisant"|null,
  "taille": str (brute, telle qu'affichée par le site), "photo": url (la meilleure),
  "photos": [url,…], "url": url de l'annonce, "dispo": bool, "vu_le": "ISO-8601",
  "emb": "<base64 int8>" }
```

## Règles de validation

- Une carte est écartée (avec un message d'erreur, sans faire échouer le reste) si l'un de ces champs
  manque ou est invalide : `id`, `site`, `titre`, `prix` (nombre supérieur ou égal à 0), `categorie`
  (clé de `CATEGORIES` dans `js/tailles.js`), `photo`, `url`, `emb`.
- Une `emb` (de carte ou de style) qui n'est pas du base64 valide écarte la carte ou le style.
- `dispo` absent vaut `true`.
- `rayon` est facultatif. Absent, `null` ou `"mixte"` : la carte est montrée à tous les profils.
  `"homme"` ou `"femme"` : la carte n'est montrée qu'aux profils de ce rayon ou « les deux ».
  Une autre valeur est remplacée par `null` (carte gardée) avec un message d'erreur.
- Toutes les empreintes (cartes, échauffement, styles) doivent avoir la même dimension (8 pour la
  démo, 512 pour FashionCLIP en phase 2). La dimension la plus fréquente fait foi ; une carte ou un
  style d'une autre dimension est écarté avec un message d'erreur.
- `source` vaut `"demo"` pour la pile de démonstration. Dès qu'une pile d'une autre source est
  chargée, les swipes des cartes de démo (ids `demo:…`) sont oubliés.
- `emb` est une empreinte FashionCLIP normalisée, quantifiée en int8 puis encodée en base64
  (voir `encoderEmb` / `decoderEmb` dans `js/empreintes.js`).
- `echauffement` contient les cartes montrées au début pour apprendre les goûts ; elles ne sont pas
  filtrées par taille ni budget, mais le rayon est respecté.
- Une annonce déjà swipée (identifiée par `id`) n'est jamais remontrée, même si la pile est régénérée.

## Recherche des annonces

Le pays et la région servent à la recherche des annonces (livraison) : le récolteur ne garde que
les annonces livrables à cet endroit. L'application ne filtre pas elle-même sur ces champs.
