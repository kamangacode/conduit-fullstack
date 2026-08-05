---
id: REQ-ARTICLE-005
title: Modifier son propre article
type: functional
domain: article
status: implemented
priority: must
source: "PRD §7.3, règles R-1 et R-6 ; openapi.yml PUT /articles/{slug}"
acceptance_criteria:
  - id: AC-1
    given: "un article et son auteur authentifié"
    when: "PUT /api/articles/:slug est appelé avec un seul champ modifié"
    then: "l'API répond 200 avec l'article à jour, et les champs non transmis conservent leur valeur"
  - id: AC-2
    given: "un article dont le titre change"
    when: "la modification est appliquée"
    then: "le slug est régénéré depuis le nouveau titre, l'ancien slug ne répond plus, et le nouveau désigne le même article avec ses commentaires et ses favoris"
  - id: AC-3
    given: "un article dont la modification ne touche pas le titre"
    when: "la modification est appliquée"
    then: "le slug reste inchangé — les URL déjà partagées ne cassent pas sans raison"
  - id: AC-4
    given: "un article appartenant à un autre utilisateur"
    when: "PUT /api/articles/:slug est appelé avec un jeton valide"
    then: "l'API répond 403 et l'article n'est pas modifié"
  - id: AC-5
    given: "un slug inconnu"
    when: "PUT /api/articles/:slug est appelé"
    then: "l'API répond 404, y compris pour un appelant qui n'aurait de toute façon pas le droit de modifier"
  - id: AC-6
    given: "aucun jeton"
    when: "PUT /api/articles/:slug est appelé"
    then: "l'API répond 401 sans révéler si le slug existe"
  - id: AC-7
    given: "une modification qui vide un champ requis (title, description ou body)"
    when: "PUT /api/articles/:slug est appelé"
    then: "l'API répond 422 et l'article reste dans son état antérieur"
implementation:
  files:
    - apps/api/src/domain/article/article.ts
    - apps/api/src/application/article/update-article.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-article.repository.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/domain/article/article.spec.ts
    - apps/api/src/application/article/update-article.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-001
    - REQ-ARTICLE-003
    - REQ-ARTICLE-006
    - REQ-ERROR-001
  adrs:
    - "008"
    - "010"
---

# REQ-ARTICLE-005 — Modifier son propre article

## Contexte

La modification est le premier endroit du domaine `article` où une **permission**
se vérifie (règle R-6). Le contrat est net sur le code à renvoyer : 403 pour un
appelant authentifié mais non-propriétaire, décision déjà tranchée et motivée
dans [ADR 008](../../../adr/008-permission-manquante-403.md) — on ne masque pas
l'existence de l'article derrière un 404, parce que cette existence est déjà
publique par `GET /api/articles/:slug`.

L'ordre de vérification, lui, n'est pas indifférent : AC-5 exige le 404 pour un
slug inconnu **avant** tout examen de propriété. Un code qui testerait la
propriété d'abord planterait sur un article absent ou répondrait 403 sur une
ressource qui n'existe pas, ce qui n'informe personne correctement.

AC-2 et AC-3 forment une paire. La spec impose la régénération du slug au
changement de titre ; la tentation symétrique — régénérer systématiquement, « au
cas où » — casserait toutes les URL d'un article dont on corrige une faute dans
la description. AC-3 est donc là pour interdire un comportement que rien
n'oblige mais que la paresse produit.

AC-2 vérifie aussi que le changement de slug est un **renommage**, pas une
recréation : les commentaires et les favoris restent attachés. C'est vrai par
construction si l'identité de l'article est son identifiant interne et non son
slug — le critère verrouille précisément ce choix de modèle.

## Règles

- Statut de succès : **200** ; non-propriétaire : **403** ; slug inconnu :
  **404** ; jeton absent : **401** (`openapi.yml`).
- **R-6** : seul l'auteur modifie son article.
- **R-1** : le slug suit le titre, et uniquement lui ([ADR 010](../../../adr/010-unicite-du-slug-article.md)).
- Mise à jour **partielle** : `updateArticleDtoSchema` de `@repo/shared`
  ([REQ-ARTICLE-001](REQ-ARTICLE-001.md) AC-5) rend tous les champs optionnels,
  mais un champ présent et vide reste une erreur de validation.
- `updatedAt` avance à chaque modification acceptée ; `createdAt` ne bouge pas.

## Hors périmètre

- La modification du `tagList` d'un article existant est couverte par le même
  endpoint et le même DTO ; aucune règle de fusion particulière n'est exigée par
  le contrat, la liste transmise remplace la précédente.
- La suppression : [REQ-ARTICLE-006](REQ-ARTICLE-006.md).
- Toute redirection depuis l'ancien slug : explicitement non prévue
  ([ADR 010](../../../adr/010-unicite-du-slug-article.md), Consequences).
- Un historique de versions de l'article : hors contrat RealWorld.
