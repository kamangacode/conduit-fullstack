---
id: REQ-ARTICLE-004
title: Consulter un article par son slug
type: functional
domain: article
status: approved
priority: must
source: "PRD §7.3, §8 (format « Article »), règles R-5 et R-7 ; openapi.yml GET /articles/{slug}"
acceptance_criteria:
  - id: AC-1
    given: "un article publié et un appelant anonyme"
    when: "GET /api/articles/:slug est appelé"
    then: "l'API répond 200 avec l'article complet — body inclus — et `favorited` comme `author.following` à false"
  - id: AC-2
    given: "un article favorisé par l'appelant, dont l'auteur est suivi par lui"
    when: "GET /api/articles/:slug est appelé avec un jeton valide"
    then: "`favorited` et `author.following` valent true, et `favoritesCount` compte tous les favoris, pas seulement le sien"
  - id: AC-3
    given: "un slug que ne porte aucun article"
    when: "GET /api/articles/:slug est appelé"
    then: "l'API répond 404"
  - id: AC-4
    given: "un article dont l'auteur porte un email et un condensat de mot de passe"
    when: "la réponse est produite"
    then: "`author` ne contient que username, bio, image et following — la projection ne laisse fuiter aucun champ privé"
implementation:
  files: []
  tests: []
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-001
    - REQ-ARTICLE-003
    - REQ-PROFILE-001
    - REQ-AUTH-001
  adrs:
    - "011"
---

# REQ-ARTICLE-004 — Consulter un article par son slug

## Contexte

C'est la lecture unitaire dont dépendent la page article du front, l'édition, et
tout ce qui se rattache à un article (commentaires, favoris). Elle est publique :
aucun jeton n'est exigé.

Sa difficulté n'est pas de trouver l'article — c'est que **trois** de ses champs
ne décrivent pas l'article mais la relation entre l'article et son lecteur :
`favorited`, `author.following`, et indirectement `favoritesCount` qui, lui, est
absolu. AC-2 les sépare explicitement, parce que la confusion naturelle consiste
à faire compter `favoritesCount` sur le seul lecteur — le compteur afficherait
alors 1 pour un article favorisé par cinquante personnes.

AC-1 et AC-2 décrivent la même ressource pour deux lecteurs différents. C'est le
même motif que [REQ-PROFILE-002](../profile/REQ-PROFILE-002.md), étendu à une
seconde relation (le favori), et c'est ce motif que
[ADR 011](../../../adr/011-lecture-des-listes-port-dedie.md) fait porter par un
port de lecture prenant le lecteur en paramètre plutôt que par une entité de
domaine qui devrait alors porter des champs qui ne lui appartiennent pas.

AC-4 reprend la garde de `REQ-PROFILE-002` AC-4 à un endroit où elle est plus
facile à perdre : l'auteur est ici un objet imbriqué, construit par un adapter
qui a chargé l'utilisateur complet pour ses besoins de jointure.

## Règles

- Statut de succès : **200** ; slug inconnu : **404** (`openapi.yml`).
- Format `Article` : PRD §8, verbatim, `body` **inclus** — R-7 ne concerne que
  les listes.
- **R-5** : `favorited` et `author.following` sont relatifs à l'appelant et
  valent `false` pour un anonyme.
- `favoritesCount` est un agrégat absolu, jamais dérivé du seul lecteur.
- L'authentification est optionnelle : un jeton absent ou invalide produit une
  lecture anonyme, pas une erreur ([REQ-AUTH-001](../auth/REQ-AUTH-001.md) AC-5).

## Hors périmètre

- Les listes d'articles, où la même projection s'applique sans le `body` :
  [REQ-ARTICLE-007](REQ-ARTICLE-007.md) et [REQ-ARTICLE-008](REQ-ARTICLE-008.md).
- Les commentaires attachés à l'article :
  [REQ-COMMENT-003](../comment/REQ-COMMENT-003.md).
- Le fait de favoriser l'article : [REQ-ARTICLE-009](REQ-ARTICLE-009.md).
- Un compteur de vues ou toute télémétrie de lecture : hors contrat RealWorld.
