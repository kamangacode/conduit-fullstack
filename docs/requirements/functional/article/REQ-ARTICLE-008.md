---
id: REQ-ARTICLE-008
title: Consulter le flux personnel des auteurs suivis
type: functional
domain: article
status: implemented
priority: must
source: "PRD §7.3, règles R-2, R-4, R-7 et R-10 ; openapi.yml GET /articles/feed"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur authentifié qui suit un auteur"
    when: "GET /api/articles/feed est appelé"
    then: "l'API répond 200 avec les seuls articles des auteurs suivis, du plus récent au plus ancien"
  - id: AC-2
    given: "un utilisateur qui a écrit des articles et n'en suit aucun autre"
    when: "GET /api/articles/feed est appelé"
    then: "le flux est vide : ses propres articles n'y figurent pas, faute de se suivre lui-même"
  - id: AC-3
    given: "aucun jeton, ou un jeton invalide"
    when: "GET /api/articles/feed est appelé"
    then: "l'API répond 401 — contrairement au listing global, l'authentification est ici obligatoire (R-4)"
  - id: AC-4
    given: "un flux dont les auteurs suivis ont publié plus d'articles qu'une page"
    when: "GET /api/articles/feed?limit=2&offset=2 est appelé"
    then: "la tranche demandée est renvoyée, et `articlesCount` porte le total du flux avant pagination"
  - id: AC-5
    given: "un flux renvoyé à son lecteur"
    when: "la réponse est validée"
    then: "aucun article ne porte de `body` (R-7), et `author.following` vaut true pour tous, puisque le flux ne contient que des auteurs suivis"
  - id: AC-6
    given: "un utilisateur qui cesse de suivre un auteur"
    when: "GET /api/articles/feed est rappelé"
    then: "les articles de cet auteur ont disparu du flux, sans qu'aucune donnée n'ait été recopiée à l'abonnement"
implementation:
  files:
    - apps/api/src/application/article/get-feed.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-article.query.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/application/article/read-articles.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-007
    - REQ-ARTICLE-002
    - REQ-PROFILE-003
    - REQ-AUTH-001
  adrs:
    - "011"
---

# REQ-ARTICLE-008 — Consulter le flux personnel des auteurs suivis

## Contexte

Le flux est le listing global ([REQ-ARTICLE-007](REQ-ARTICLE-007.md)) auquel on
retire deux libertés : il n'accepte pas de filtre, et il **exige**
l'authentification (règle R-4). Cette seconde différence est la seule de tout le
domaine `article` : partout ailleurs, un jeton absent dégrade la réponse sans
l'interdire. Ici il n'y a pas de flux anonyme concevable — le flux *est* la
relation de suivi de l'appelant.

AC-2 verrouille une décision que la spec ne formule pas explicitement mais que la
mécanique impose : ses propres articles ne sont pas dans son flux, parce qu'on ne
figure pas dans sa propre liste d'abonnements. Une implémentation qui ajouterait
l'auteur à son flux « par confort » produirait une page d'accueil différente de
celle des autres implémentations Conduit, et la suite de conformité ne l'attrape
pas nécessairement.

AC-6 exprime que le flux est **calculé**, pas matérialisé. Un flux alimenté par
recopie au moment de l'abonnement (fan-out à l'écriture) répondrait à AC-1 et
échouerait ici : les articles déjà distribués resteraient après un désabonnement.
Le critère fixe donc une propriété d'architecture par un comportement
observable, sans nommer l'implémentation.

AC-5 précise un fait qui simplifie la lecture : dans un flux, `author.following`
est vrai partout — c'est la définition même du flux. Le critère paraît trivial et
ne l'est pas : il attrape une implémentation qui aurait oublié de transmettre le
lecteur au port de lecture et renverrait `false` partout, ce qui casse le bouton
« Unfollow » de la page front sans qu'aucune donnée ne soit manquante.

## Règles

- Statut de succès : **200** ; jeton absent ou invalide : **401**
  (`openapi.yml`).
- **R-4** : le flux ne contient que les articles des auteurs suivis et exige
  l'authentification.
- **R-2** : tri par date de création décroissante.
- **R-7** : la forme de liste omet le `body`.
- **R-10** : `limit` / `offset` avec les mêmes défauts que le listing global
  ([REQ-ARTICLE-002](REQ-ARTICLE-002.md)).
- Aucun filtre `tag`, `author` ni `favorited` : le contrat ne les prévoit pas sur
  cet endpoint.

## Hors périmètre

- Le listing global et ses filtres : [REQ-ARTICLE-007](REQ-ARTICLE-007.md).
- L'établissement de la relation de suivi elle-même :
  [REQ-PROFILE-003](../profile/REQ-PROFILE-003.md).
- Toute notion de « lu / non lu », de notification ou de classement autre que
  chronologique : hors contrat RealWorld.
