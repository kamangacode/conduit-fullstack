---
id: REQ-WEB-005
title: Consulter un profil public et suivre son auteur
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (route /profile/:username), §7.2, règle R-5 ; markup RealWorld `.profile-page`"
acceptance_criteria:
  - id: AC-1
    given: "un username existant"
    when: "la page de profil est demandée"
    then: "l'écran d'attente `.profile-page` est rendu sans `.user-info`, puis le username, la bio et l'image apparaissent une fois la réponse arrivée — le rendu vient du navigateur depuis l'ADR 020, et non plus du serveur"
  - id: AC-2
    given: "un visiteur anonyme"
    when: "la page est rendue"
    then: "le bouton de suivi apparaît comme non suivi (R-5), et l'actionner conduit à la page de connexion plutôt qu'à un appel refusé"
  - id: AC-3
    given: "un utilisateur connecté qui ne suit pas ce profil"
    when: "il actionne le bouton de suivi"
    then: "le bouton bascule en « suivi » et l'état est persisté côté API"
  - id: AC-4
    given: "un utilisateur qui suit déjà ce profil"
    when: "il actionne le bouton"
    then: "il cesse de suivre, et le bouton revient à son état initial"
  - id: AC-5
    given: "un utilisateur consultant son propre profil"
    when: "la page est rendue"
    then: "le bouton de suivi est remplacé par le lien vers ses paramètres, comme dans le front de référence"
  - id: AC-6
    given: "un username que ne porte aucun compte"
    when: "la page est demandée"
    then: "la coquille « profil introuvable » est rendue, et non un profil vide"
  - id: AC-7
    given: "un lecteur porteur d'un jeton et une page qui charge une ressource dont un champ dépend de lui (profil, article)"
    when: "cette page est chargée"
    then: "aucune requête n'est émise tant que `status === 'pending'`, celle qui part ensuite porte le jeton du lecteur, et les ressources publiques de la même page (commentaires, listes préchargées) ne sont pas retardées"
  - id: AC-8
    given: "un lecteur connecté qui suit déjà `{u}`"
    when: "il charge ou recharge `/profile/{u}`"
    then: "le bouton porte `Unfollow {u}` et la classe `btn-secondary` avant tout clic"
  - id: AC-9
    given: "un bouton de suivi monté sur un profil"
    when: "une réponse fraîche pour le même username porte un `following` différent de celui affiché"
    then: "le bouton suit la réponse — l'état local ne conserve que l'écart produit par une bascule en cours"
implementation:
  files:
    - apps/web/src/components/FollowButton.tsx
    - apps/web/src/components/ProfileView.tsx
    - apps/web/src/components/ArticleView.tsx
    - apps/web/src/app/profile-page.tsx
  tests:
    - apps/web/src/components/FollowButton.spec.tsx
    - apps/web/src/components/ProfileView.spec.tsx
    - apps/web/src/components/ArticleView.spec.tsx
related:
  issues: [7, 12, 15]
  requirements:
    - REQ-WEB-001
    - REQ-WEB-002
    - REQ-WEB-016
    - REQ-WEB-018
    - REQ-PROFILE-002
    - REQ-PROFILE-003
  adrs:
    - "012"
    - "020"
---

# REQ-WEB-005 — Consulter un profil public et suivre son auteur

## Contexte

C'est la première page où la frontière de l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)
devient visible, et elle est ici justifiée par le contrat lui-même : le profil
est **public** — username, bio, image sont identiques pour tout le monde — tandis
que `following` est **relatif au lecteur** (R-5).

**AC-1 est amendé.** Sa première rédaction affirmait que le HTML rendu par le
serveur portait déjà username, bio et image. C'était exact jusqu'à
l'[ADR 020](../../../adr/020-chargement-client-des-pages-de-contenu.md), qui a
déplacé le chargement du profil vers le navigateur : la page ne se coupe plus
entre un contenu serveur et un fragment client, elle est cliente en entier. Le
critère décrit désormais ce que le lecteur voit — l'écran d'attente, puis le
profil — parce que c'est ce qui reste opposable quand le rendu change de côté.
L'ADR figurait dans `related.adrs` depuis son adoption ; le critère, lui,
n'avait pas été relu.

**AC-7 est le critère que l'ADR 020 rendait nécessaire et que personne n'a
écrit.** Une requête dont un champ dépend du lecteur, émise avant que la session
ait résolu son jeton, part **anonyme** : l'API répond `following: false`, ce qui
est juste pour l'appelant qu'elle a vu, et rien ne reprend cette réponse — la
clé de cache ne porte pas l'identité du lecteur, `staleTime` vaut trente
secondes et le refetch au focus est désactivé. Ce n'est pas une course dont
l'issue varie : React exécute les effets **des enfants vers le parent**, donc le
montage d'une page est toujours antérieur à la lecture du stockage par
`SessionProvider`. Le lecteur qui suit déjà voyait donc « Follow » à chaque
chargement, et c'est ce qui faisait échouer `social.spec.ts`.

La garde s'écrit sur `pending` **seulement**. `anonymous`, `authenticated` et
`unavailable` sont trois réponses : dans le premier cas il n'y a pas de jeton et
`following: false` est la vérité, dans les deux autres il y en a un à envoyer.
Attendre au-delà bloquerait sur un écran d'attente permanent un lecteur dont
l'API est en rade (REQ-WEB-016). C'est la troisième fois que la distinction
`pending` / `anonymous` se paie dans ce dépôt, après `/settings` et
`/?feed=following` — voir `artifacts/lessons.md`.

AC-8 est la conséquence observable d'AC-7 côté bouton, et AC-9 ferme le second
verrou : l'état de suivi **dérive de la prop**, il ne la copie pas. Une
resynchronisation conditionnée au seul changement de username ignorait
silencieusement une réponse fraîche portant un `following` différent pour le
*même* profil.

AC-2 traite le visiteur anonyme sans lui mentir. Deux mauvaises réponses sont
possibles : masquer le bouton, ce qui s'écarte du front de référence et prive
l'utilisateur de l'information « on peut suivre ici » ; ou l'afficher et laisser
l'appel partir, pour recevoir un 401 que l'interface devra traduire. Rediriger
vers la connexion est la seule réponse qui reste conforme au markup **et** utile.

AC-5 reprend un détail du front de référence qui n'est pas cosmétique : sans
lui, un utilisateur voit un bouton « Follow » sur son propre profil, l'actionne,
et l'API accepte — le contrat n'interdit pas l'auto-suivi
([REQ-PROFILE-003](../profile/REQ-PROFILE-003.md)). L'interface est donc le seul
endroit où ce non-sens peut être évité, et elle l'évite en n'offrant pas
l'action.

## Règles

- Route : `/profile/:username` (PRD §5).
- Le profil est demandé **par le navigateur** depuis l'[ADR 020] ; la liste
  d'articles garde son préchargement serveur, **sans jeton** (ADR 012 et 015).
- **R-5** : `following` vaut `false` pour un anonyme ; l'état affiché est celui
  que l'API renvoie **pour le lecteur**, ce qui suppose que la requête soit
  partie avec son jeton (AC-7).
- Le bouton de suivi **dérive** de la prop qu'il reçoit et ne garde en local que
  l'écart d'une bascule non encore reflétée par le serveur (AC-9) — le motif
  déjà appliqué à `ArticlePreview` pour le favori.
- Markup RealWorld : `.profile-page`, `.user-info`, `.action-btn` (rule 11).
- Username inconnu : l'API répond 404
  ([REQ-PROFILE-002](../profile/REQ-PROFILE-002.md) AC-3) et le front en fait une
  coquille « profil introuvable ». **Le statut HTTP de la page, lui, est 200** :
  la réponse est partie avant que l'absence soit connue, conséquence assumée de
  l'[ADR 020](../../../adr/020-chargement-client-des-pages-de-contenu.md).

## Hors périmètre

- Les onglets « My Articles » et « Favorited Articles » du profil : ils listent
  des articles et relèvent de la slice F5, avec le reste des listes.
- L'édition de son propre profil : [REQ-WEB-004](REQ-WEB-004.md).
- La relation de suivi côté API : [REQ-PROFILE-003](../profile/REQ-PROFILE-003.md).
- **Le préchargement serveur des listes** (`prefetchFeed`) : il part anonyme par
  construction — le serveur ne connaît pas la session (ADR 012) — donc les
  aperçus hydratés portent `favorited: false` pour tout le monde, et `staleTime`
  empêche le client de rectifier pendant trente secondes. C'est la **même
  famille** de défaut qu'AC-7, sur une surface plus large et avec un arbitrage
  d'architecture derrière : l'[ADR 015](../../../adr/015-prefetch-serveur-et-hydratation-des-listes.md)
  échange précisément la fraîcheur relative au lecteur contre un premier
  affichage sans aller-retour. Le corriger au passage viderait cet ADR de son
  objet ; il est nommé ici pour ne pas se redécouvrir comme une surprise.
