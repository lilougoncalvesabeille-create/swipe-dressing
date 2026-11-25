# Points à reprendre après la phase 1

Ce sont les remarques mineures relevées par les relectures de la phase 1 et laissées de côté volontairement. Aucune ne casse l'appli aujourd'hui.

## À régler avant que les vraies annonces arrivent (début de la phase 2)

### Tailles (`js/tailles.js`)
- Le préfixe `EU 42` n'est pas lu.
- Les tailles doubles avec un tiret (`M-L`, `38-40`) ne sont pas lues.
- La lecture des pointures n'est pas bornée (`2023` est lu comme une pointure 23).
- Il manque des tests pour le mode stricte en W et en pointure, et pour les tailles en minuscules ou du type `Taille M`.

### Pile et stockage
- `chargerPile` ne doit pas enregistrer une pile qui ne contient aucune carte valide.
- `swipeValide` doit aussi vérifier que l'empreinte (`emb`) est lisible. Sinon, un swipe corrompu fait planter le classement.
- La taille du stockage va poser problème. Chaque swipe garde la carte entière et son empreinte (environ 1,2 ko en dimension 512). Il faudra garder les refus sous forme compacte (id + empreinte) ou passer à IndexedDB, et mettre en cache les empreintes décodées.
- Les favoris doivent pouvoir être remis à jour (« Plus dispo ») par le récolteur. Le swipe garde une copie de la carte, donc il faudra prévoir comment la mettre à jour.

## Confort et accessibilité

### Navigation
- Le bouton retour d'Android n'est géré que sur la fiche détail. Sur les autres écrans, il ferme l'appli.
- Les modifications non enregistrées dans Réglages sont perdues sans prévenir.
- « Annuler » peut remonter aux sessions précédentes. C'est une question de choix produit.
- Après un repêchage, « Annuler » annule le dernier swipe.

### Swipe
- Les puces de raison du refus disparaissent au bout de 4 s, ce qui est court pour un lecteur d'écran.
- Pendant l'animation de sortie, un appui sur un bouton en plein glissé provoque un petit défaut visuel.
- Au clavier, une flèche maintenue swipe en continu et le focus se perd après un swipe.

### Accessibilité
- Le changement d'étape du questionnaire n'est pas annoncé au lecteur d'écran.
- Le contraste du texte d'exemple dans les champs est d'environ 4:1.

### Fiche détail
- Au retour d'une fiche, le focus ne revient pas sur la vignette ouverte.
- Le bouton « Suivant » du navigateur laisse une entrée morte dans l'historique.

## Deux copies ouvertes en même temps (appli installée + onglet Chrome)
- Une annulation, ou « Tout effacer », faite dans une copie peut être perdue si l'autre copie écrit à la milliseconde près. Aucun swipe n'est perdu pour autant.
- Une copie restaurée depuis le cache arrière/avant du navigateur ne se resynchronise pas (il faudrait écouter `pageshow`).
- Le profil est enregistré en « dernier qui écrit gagne ».

## Divers
- En local, le service worker sert les fichiers depuis le cache. Pour voir ses modifications, il faut le désinscrire ou changer `VERSION`.
- Il faudrait un message d'erreur clair quand la clé GitHub n'a pas les bons droits (erreur 403).
- Chaque relance de `premiere-mise-en-ligne.ps1` crée un commit.
- Sept dessins SVG de démo contiennent un tracé vide.
- `LETTRES` et `LETTRES_TAILLE` font double emploi.
- Les libellés d'état ne sont pas écrits pareil d'un écran à l'autre (« Bon » ou « Bon état »).
- Les apostrophes droites et typographiques sont mélangées.
