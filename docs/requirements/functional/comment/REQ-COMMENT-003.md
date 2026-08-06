---
id: REQ-COMMENT-003
title: Lister les commentaires d'un article
type: functional
domain: comment
status: implemented
priority: must
source: "PRD §7.4, §8 (format « MultipleComments »), règle R-5 ; openapi.yml GET /articles/{slug}/comments"
acceptance_criteria:
  - id: AC-1
    given: "un article portant plusieurs commentaires et un appelant anonyme"
    when: "GET /api/articles/:slug/comments est appelé"
    then: "l'API répond 200 avec l'enveloppe `{ comments: [...] }` — sans compteur ni pagination, que le contrat ne prévoit pas"
  - id: AC-2
    given: "un article sans aucun commentaire"
    when: "GET /api/articles/:slug/comments est appelé"
    then: "l'API répond 200 avec une liste vide, et non 404 : l'article existe, sa conversation est vide"
  - id: AC-3
    given: "un appelant authentifié qui suit l'auteur d'un des commentaires"
    when: "GET /api/articles/:slug/comments est appelé avec son jeton"
    then: "`author.following` vaut true pour ce commentaire et false pour les autres (R-5)"
  - id: AC-4
    given: "un slug inconnu"
    when: "GET /api/articles/:slug/comments est appelé"
    then: "l'API répond 404"
  - id: AC-5
    given: "des commentaires dont les auteurs portent un email et un condensat"
    when: "la réponse est produite"
    then: "chaque `author` ne contient que username, bio, image et following"
implementation:
  files:
    - apps/api/src/application/comment/list-comments.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-comment.repository.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/application/comment/comments.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [6]
  requirements:
    - REQ-COMMENT-001
    - REQ-COMMENT-002
    - REQ-PROFILE-001
    - REQ-AUTH-001
  adrs:
    - "011"
---

# REQ-COMMENT-003 — Lister les commentaires d'un article

## Contexte

C'est la seule liste du contrat qui n'est **ni paginée ni comptée** : la spec
renvoie `{ comments: [...] }`, sans `commentsCount` ni `limit`. Le modèle partagé
l'acte déjà et explique pourquoi on ne l'améliore pas
([REQ-COMMENT-001](REQ-COMMENT-001.md)) : ajouter une pagination ferait dévier ce
dépôt du contrat que la suite de conformité vérifie, et rendrait les cinq
implémentations Conduit non comparables. AC-1 le verrouille par un test plutôt
que par une bonne intention.

AC-2 distingue deux absences qu'un même code HTTP confondrait : l'article
n'existe pas (404, AC-4) contre l'article existe et personne n'a commenté (200,
liste vide). Se tromper ici casse la page article du front, qui affiche
l'article puis échoue à charger sa conversation.

AC-3 rappelle que même une liste de commentaires porte une relation au lecteur :
chaque auteur est un `Profile` complet, `following` compris. C'est le même motif
que les listes d'articles, avec la même conséquence — la résolution passe par le
port de lecture qui reçoit le lecteur
([ADR 011](../../../adr/011-lecture-des-listes-port-dedie.md)), et non par une
requête par commentaire.

## Règles

- Statut de succès : **200** ; slug inconnu : **404** (`openapi.yml`).
- Format `MultipleComments` : PRD §8, verbatim — **pas** de compteur, **pas** de
  pagination.
- **R-5** : `author.following` est relatif à l'appelant, `false` pour un anonyme.
- L'authentification est optionnelle : la conversation est publique en lecture.
- L'ordre des commentaires n'est pas imposé par le contrat ; on retient l'ordre
  chronologique de création, stable et prévisible.

## Hors périmètre

- L'ajout d'un commentaire : [REQ-COMMENT-002](REQ-COMMENT-002.md).
- Sa suppression : [REQ-COMMENT-004](REQ-COMMENT-004.md).
- Toute pagination ou compteur de commentaires : volontairement exclus, voir
  ci-dessus.
