---
id: REQ-ARTICLE-003
title: Publier un article
type: functional
domain: article
status: implemented
priority: must
source: "PRD §7.3, §8 (format « Article »), règle R-1 ; openapi.yml POST /articles"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur authentifié et un article valide"
    when: "POST /api/articles est appelé"
    then: "l'API répond 201 avec l'enveloppe `{ article: … }` complète, body compris, et l'auteur est le porteur du jeton"
  - id: AC-2
    given: "un titre « How to train your dragon »"
    when: "l'article est créé"
    then: "le slug vaut `how-to-train-your-dragon` — kebab-case, sans accent ni ponctuation, sans tiret aux extrémités"
  - id: AC-3
    given: "un article déjà publié sous ce titre"
    when: "un second article au titre identique est créé"
    then: "la création aboutit avec un slug distinct suffixé (`…-2`), sans qu'aucune vérification d'existence préalable ne soit faite"
  - id: AC-4
    given: "une requête dont le corps porte un champ `author` ou `slug`"
    when: "l'article est créé"
    then: "ces champs sont ignorés : l'auteur vient du jeton et le slug du titre, jamais de l'appelant"
  - id: AC-5
    given: "un tagList contenant des doublons et un tag déjà utilisé par un autre article"
    when: "l'article est créé"
    then: "les tags sont dédoublonnés et le tag existant est réutilisé plutôt que recréé en double"
  - id: AC-6
    given: "aucun jeton, ou un jeton invalide"
    when: "POST /api/articles est appelé"
    then: "l'API répond 401 et aucun article n'est créé"
  - id: AC-7
    given: "un corps dont le title, la description ou le body est vide"
    when: "POST /api/articles est appelé"
    then: "l'API répond 422 au format `{ errors: { champ: [messages] } }`"
implementation:
  files:
    - apps/api/src/domain/article/slug.ts
    - apps/api/src/application/article/create-article.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-article.repository.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/domain/article/slug.spec.ts
    - apps/api/src/application/article/create-article.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-001
    - REQ-AUTH-001
    - REQ-TAG-001
    - REQ-ERROR-001
  adrs:
    - "010"
---

# REQ-ARTICLE-003 — Publier un article

## Contexte

La publication est le premier endroit du dépôt où l'API **fabrique** un
identifiant public au lieu de le recevoir. Le `slug` (règle R-1) n'est ni fourni
par le client, ni tiré au sort : il est dérivé du titre, ce qui le rend lisible
mais aussi **collisionnable** — deux auteurs peuvent légitimement publier sous le
même titre, et la spec exige alors deux slugs distincts sans refuser la seconde
création.

AC-3 fixe le comportement attendu, et [ADR 010](../../../adr/010-unicite-du-slug-article.md)
en fixe la mécanique : la contrainte d'unicité de la base tranche, pas une
lecture préalable. Le critère est vérifiable sans piloter la concurrence — deux
créations successives suffisent à prouver le suffixe — mais c'est bien la course
concurrente qu'il protège.

AC-4 n'est pas une précaution théorique. Le corps de la requête et la ressource
créée partagent des noms de champs ; un adapter écrit par étalement du DTO
laisserait un appelant se déclarer auteur d'un article. C'est la règle de
*server-side authority* : ce qui engage l'identité vient du jeton vérifié, jamais
du corps. La même logique protège le commentaire
([REQ-COMMENT-002](../comment/REQ-COMMENT-002.md)).

AC-5 protège la sidebar « Popular Tags » : deux tags qui ne diffèrent que par
l'espacement produiraient deux entrées pour un même sujet, et un tag recréé à
chaque article ferait diverger la liste des tags de la réalité des articles.

## Règles

- Statut de succès : **201** (`openapi.yml`) ; format `Article` : PRD §8, verbatim.
- **R-1** : le slug est dérivé du titre et sert d'identifiant public.
- L'article créé est renvoyé **complet**, `body` inclus : la règle R-7 ne
  s'applique qu'aux endpoints de liste.
- `favorited` vaut `false` et `favoritesCount` vaut `0` à la création : l'auteur
  ne favorise pas son article automatiquement.
- `following` de l'auteur, vu par lui-même, vaut `false` : on ne se suit pas.
- Validation des entrées par `createArticleDtoSchema` de `@repo/shared`
  ([REQ-ARTICLE-001](REQ-ARTICLE-001.md) AC-4) ; erreurs au format §10
  ([REQ-ERROR-001](../error/REQ-ERROR-001.md)).
- Normalisation des tags : `tagSchema` de `@repo/shared`
  ([REQ-TAG-001](../tag/REQ-TAG-001.md)) — le trim est fait au bord, une seule
  fois, pas dans le use case.

## Hors périmètre

- La modification et la suppression : [REQ-ARTICLE-005](REQ-ARTICLE-005.md) et
  [REQ-ARTICLE-006](REQ-ARTICLE-006.md).
- La lecture de l'article publié : [REQ-ARTICLE-004](REQ-ARTICLE-004.md).
- L'agrégation des tags exposée par `GET /api/tags` :
  [REQ-TAG-002](../tag/REQ-TAG-002.md).
- Toute limite de longueur du `body` ou nombre maximal de tags : absente du
  contrat RealWorld, donc non imposée ici.
