# Format de la pile

Contrat entre le récolteur (phase 2) et l'application. La pile est un fichier JSON
(`data/demo-pile.json` pour la démo), validé par `validerPile` dans `js/pile.js`.

```
{ "version": 1, "genere_le": "ISO-8601", "source": "demo"|"pc"|"actions",
  "styles":       [ {"nom": "streetwear", "emb": "<base64 int8>"} , … ],
  "echauffement": [ Carte, … ],
  "cartes":       [ Carte, … ] }
Carte = { "id": "vinted:123", "site": "vinted"|"zalando"|"veepee"|"demo",
  "titre": str, "description": str, "prix": number (euros), "categorie": clé de CATEGORIES,
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
- `emb` est une empreinte FashionCLIP normalisée, quantifiée en int8 puis encodée en base64
  (voir `encoderEmb` / `decoderEmb` dans `js/empreintes.js`).
- `echauffement` contient les cartes montrées au début pour apprendre les goûts ; elles ne sont pas
  filtrées par taille ni budget.
- Une annonce déjà swipée (identifiée par `id`) n'est jamais remontrée, même si la pile est régénérée.
