# Points à reprendre

Ce sont des remarques mineures relevées par les relectures et laissées de côté volontairement. Aucune
ne casse l'appli. Liste remise à jour le 2026-11-27 : les points réglés depuis la phase 1 en ont été
retirés (lecture des tailles, pile sans carte valide, swipes illisibles, taille du stockage, « Plus
dispo » sur les favoris, geste « retour » d'Android, message de clé refusée, flèche du clavier
maintenue, page restaurée par le bouton retour du navigateur, libellés d'état).

## Navigation
- « Annuler » peut remonter aux sessions précédentes. C'est une question de choix produit.
- Après un repêchage, « Annuler » annule le dernier swipe.
- Après être revenu aux cartes par la barre de navigation depuis Favoris, Historique ou Réglages,
  le premier geste « retour » ne fait rien (l'entrée d'historique de l'écran quitté est consommée) ;
  le suivant ferme l'appli comme avant.

## Swipe
- Pendant l'animation de sortie, un appui sur un bouton en plein glissé provoque un petit défaut visuel.
- Au clavier, le focus se perd après un swipe.

## Accessibilité
- Le contraste du texte d'exemple dans les champs est d'environ 4:1.

## Fiche détail
- Le bouton « Suivant » du navigateur laisse une entrée morte dans l'historique.

## Deux copies ouvertes en même temps (appli installée + onglet Chrome)
- Une annulation, ou « Tout effacer », faite dans une copie peut être perdue si l'autre copie écrit à
  la milliseconde près. Aucun swipe n'est perdu pour autant.
- Le profil est enregistré en « dernier qui écrit gagne ».

## Plusieurs appareils
- Deux appareils sur des versions différentes peuvent effacer l'un après l'autre la marque
  d'échauffement ou les fiches des refus, jusqu'à ce que les deux soient à jour.
- Un formulaire de Réglages resté ouvert longtemps (enregistré, ou quitté après une modification) peut
  écraser un profil plus récent venu d’un autre
  appareil.
- Le lien « autre appareil » (#cle=…) peut rester dans l'historique du navigateur et le presse-papiers.
- Sur iPhone, Safari et l'appli installée sur l'écran d'accueil ont des stockages séparés : la clé est
  à donner dans chacun.

## Sources d'annonces
- Zalando refuse les requêtes automatiques (403 Akamai) ; eBay, Vestiaire Collective et Depop aussi.
  Leboncoin interdit la recherche dans son robots.txt. Veepee demande un compte. Ils ne sont pas
  récoltés : seuls Vinted et Label Emmaüs le sont.

## Divers
- En local, le service worker sert les fichiers depuis le cache. Pour voir ses modifications, il faut le
  désinscrire ou changer `VERSION` (ou ouvrir l'appli sur http://127.0.0.1 au lieu de localhost).
- Chaque relance de `premiere-mise-en-ligne.ps1` crée un commit.
- Sept dessins SVG de démo contiennent un tracé vide.
- `LETTRES` et `LETTRES_TAILLE` font double emploi.
- Les apostrophes droites et typographiques sont mélangées.
