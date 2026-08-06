---
id: REQ-COMMENT-002
title: Commenter un article
type: functional
domain: comment
status: implemented
priority: must
source: "PRD §7.4, §8 (format « Comment ») ; openapi.yml POST /articles/{slug}/comments"
acceptance_criteria:
  - id: AC-1
    given: "un article publié et un utilisateur authentifié"
    when: "POST /api/articles/:slug/comments est appelé avec un corps non vide"
    then: "l'API répond 201 avec l'enveloppe `{ comment: … }`, dont l'auteur est le porteur du jeton"
  - id: AC-2
    given: "un commentaire créé"
    when: "la réponse est validée"
    then: "son `id` est un entier positif, conformément au contrat, et non un identifiant opaque"
  - id: AC-3
    given: "une requête dont le corps porte un champ `author` ou `id`"
    when: "le commentaire est créé"
    then: "ces champs sont ignorés : l'auteur vient du jeton et l'identifiant de la base"
  - id: AC-4
    given: "un corps de commentaire vide ou réduit à des espaces"
    when: "POST /api/articles/:slug/comments est appelé"
    then: "l'API répond 422 et aucun commentaire n'est créé"
  - id: AC-5
    given: "aucun jeton"
    when: "POST /api/articles/:slug/comments est appelé"
    then: "l'API répond 401"
  - id: AC-6
    given: "un slug inconnu"
    when: "POST /api/articles/:slug/comments est appelé avec un jeton valide"
    then: "l'API répond 404 — on ne commente pas un article qui n'existe pas"
implementation:
  files:
    - apps/api/src/domain/comment/comment.ts
    - apps/api/src/application/comment/add-comment.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-comment.repository.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/domain/comment/comment.spec.ts
    - apps/api/src/application/comment/comments.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [6]
  requirements:
    - REQ-COMMENT-001
    - REQ-COMMENT-003
    - REQ-ARTICLE-004
    - REQ-ERROR-001
  adrs:
    - "004"
---

# REQ-COMMENT-002 — Commenter un article

## Contexte

Le commentaire est la ressource la plus simple du contrat, et pourtant la seule
dont l'**identifiant technique traverse l'API** : `DELETE /api/articles/:slug/comments/:id`
l'exige. C'est ce qui a conduit à aligner la persistance sur le contrat plutôt
que l'inverse — l'`id` est un entier auto-incrémenté, décision et alternatives
dans [ADR 004](../../../adr/004-persistance-alignee-sur-le-contrat.md). AC-2
vérifie que cet alignement tient jusque dans la réponse : c'est le premier
endpoint qui expose le type retenu.

AC-3 est la même garde de *server-side authority* que pour l'article
([REQ-ARTICLE-003](../article/REQ-ARTICLE-003.md) AC-4), et elle est ici plus
exposée : le DTO ne porte qu'un seul champ (`body`), si bien qu'un adapter qui
passerait le corps de requête tel quel à la couche de persistance semblerait
inoffensif. Il permettrait pourtant de commenter au nom d'un autre.

AC-6 tranche l'ordre des vérifications. L'article est le parent du commentaire :
son absence est un 404, y compris pour un appelant authentifié dont le corps
serait par ailleurs invalide. Vérifier la validation d'abord répondrait 422 pour
un article inexistant, ce qui laisse croire que la ressource existe et que seul
le corps est en cause.

## Règles

- Statut de succès : **201** (`openapi.yml`) ; format `Comment` : PRD §8,
  verbatim.
- L'auteur est dérivé du jeton vérifié, jamais du corps.
- `id` entier positif ([ADR 004](../../../adr/004-persistance-alignee-sur-le-contrat.md)).
- `author.following` est calculé relativement à l'appelant — pour l'auteur du
  commentaire lui-même, il vaut `false`.
- Validation d'entrée : `createCommentDtoSchema` de `@repo/shared`
  ([REQ-COMMENT-001](REQ-COMMENT-001.md)) ; erreurs au format §10
  ([REQ-ERROR-001](../error/REQ-ERROR-001.md)).
- Slug inconnu : **404**, vérifié avant la validation du corps.

## Hors périmètre

- La lecture des commentaires : [REQ-COMMENT-003](REQ-COMMENT-003.md).
- Leur suppression : [REQ-COMMENT-004](REQ-COMMENT-004.md).
- La modification d'un commentaire : **absente du contrat RealWorld**, aucun
  endpoint ne l'expose.
- Les réponses imbriquées, les mentions et la modération : hors périmètre.
