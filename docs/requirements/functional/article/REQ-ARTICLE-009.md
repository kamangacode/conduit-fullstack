---
id: REQ-ARTICLE-009
title: Favoriser et défavoriser un article
type: functional
domain: article
status: implemented
priority: must
source: "PRD §7.5, règle R-5 ; openapi.yml POST et DELETE /articles/{slug}/favorite"
acceptance_criteria:
  - id: AC-1
    given: "un article non favorisé et un utilisateur authentifié"
    when: "POST /api/articles/:slug/favorite est appelé"
    then: "l'API répond 200 avec l'article, `favorited` à true et `favoritesCount` incrémenté de 1"
  - id: AC-2
    given: "un article déjà favorisé par cet utilisateur"
    when: "POST /api/articles/:slug/favorite est rappelé"
    then: "la réponse reste 200 avec `favoritesCount` inchangé — l'opération est idempotente, pas un doublon ni un conflit"
  - id: AC-3
    given: "un article favorisé"
    when: "DELETE /api/articles/:slug/favorite est appelé"
    then: "l'API répond 200 avec `favorited` à false et `favoritesCount` décrémenté de 1"
  - id: AC-4
    given: "un article que l'appelant n'a jamais favorisé"
    when: "DELETE /api/articles/:slug/favorite est appelé"
    then: "la réponse reste 200 avec `favoritesCount` inchangé, sans erreur ni compteur négatif"
  - id: AC-5
    given: "un article favorisé par plusieurs utilisateurs"
    when: "un tiers anonyme le consulte"
    then: "`favoritesCount` porte le total de tous les favoris tandis que `favorited` vaut false pour lui (R-5)"
  - id: AC-6
    given: "aucun jeton"
    when: "POST ou DELETE /api/articles/:slug/favorite est appelé"
    then: "l'API répond 401 et aucun favori n'est enregistré ni retiré"
  - id: AC-7
    given: "un slug inconnu"
    when: "POST ou DELETE /api/articles/:slug/favorite est appelé avec un jeton valide"
    then: "l'API répond 404"
implementation:
  files:
    - apps/api/src/application/article/favorite-article.use-case.ts
    - apps/api/src/application/article/unfavorite-article.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-favorite.repository.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/application/article/favorite-article.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-004
    - REQ-ARTICLE-007
    - REQ-PROFILE-003
  adrs:
    - "011"
---

# REQ-ARTICLE-009 — Favoriser et défavoriser un article

## Contexte

Le favori est à l'article ce que le suivi est au profil
([REQ-PROFILE-003](../profile/REQ-PROFILE-003.md)) : une relation binaire entre
l'appelant et une ressource, qu'on établit et qu'on retire. Il en hérite la
propriété essentielle — l'**idempotence**. Favoriser deux fois n'est pas une
erreur à signaler, c'est un état déjà atteint ; AC-2 et AC-4 l'exigent des deux
côtés.

Ce n'est pas du confort. Le bouton du front est optimiste : il bascule d'abord et
appelle ensuite. Un double-clic, un retour arrière ou une reprise réseau
produisent naturellement deux appels identiques. Une API qui répondrait 409 sur
le second obligerait chaque client à distinguer « déjà fait » de « échec », alors
que le résultat visé est atteint dans les deux cas. C'est la même raison qui a
fait écrire le suivi sans branche conditionnelle, par `upsert` et `deleteMany`.

AC-5 sépare les deux natures qui cohabitent dans la même réponse :
`favoritesCount` est un **agrégat absolu**, `favorited` une **relation au
lecteur**. Le raccourci qui consiste à dériver le compteur du lecteur — ou, plus
subtil, à le décrémenter localement après un `DELETE` sans le relire — produit un
compteur qui dérive de la réalité au fil des sessions. Le schéma ne dénormalise
pas ce compteur ([ADR 002](../../../adr/002-modele-donnees-prisma.md)) : il est
calculé, donc juste par construction.

Rien n'interdit à un auteur de favoriser son propre article : le contrat ne
l'exclut pas, et l'inventer créerait un cas particulier que les autres
implémentations Conduit n'ont pas.

## Règles

- Statut de succès : **200** dans les deux sens, avec l'article complet en
  réponse (`openapi.yml`) — et non un 204, contrairement à la suppression
  d'article.
- L'article renvoyé porte son `body` : c'est une réponse unitaire, R-7 ne
  s'applique pas.
- **R-5** : `favorited` est relatif à l'appelant ; `favoritesCount` est absolu.
- Idempotence dans les deux sens : ni doublon, ni 409, ni compteur négatif.
- Jeton absent ou invalide : **401** ; slug inconnu : **404**.

## Hors périmètre

- Le filtre `favorited=username` du listing, qui lit cette relation sans la
  modifier : [REQ-ARTICLE-007](REQ-ARTICLE-007.md) AC-5.
- La liste des utilisateurs ayant favorisé un article : absente du contrat.
- Le suivi d'un auteur, relation de même forme mais d'objet différent :
  [REQ-PROFILE-003](../profile/REQ-PROFILE-003.md).
