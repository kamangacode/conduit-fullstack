---
id: REQ-ARTICLE-001
title: Représenter et valider l'article et ses entrées
type: functional
domain: article
status: implemented
priority: must
source: "PRD §7.3, §8 (formats « Article » et « MultipleArticles »), règle R-7"
acceptance_criteria:
  - id: AC-1
    given: "un article renvoyé à l'unité"
    when: "il est validé contre le modèle partagé"
    then: "il porte le format §8 complet — dates ISO 8601, favoritesCount positif, et un auteur qui est un Profile entier, jamais un simple username"
  - id: AC-2
    given: "un article présenté dans une liste"
    when: "il est validé"
    then: "le body est absent de la forme de liste (R-7) sans qu'aucun autre champ du contrat ne soit perdu"
  - id: AC-3
    given: "une réponse de liste d'articles"
    when: "elle est validée"
    then: "elle porte articlesCount, dont le front a besoin pour paginer"
  - id: AC-4
    given: "une demande de création d'article"
    when: "elle est validée"
    then: "title, description et body sont exigés et non vides après normalisation, et un tagList absent est normalisé en tableau vide"
  - id: AC-5
    given: "une demande de mise à jour d'article"
    when: "elle est validée"
    then: "un seul champ suffit, mais vider un champ requis reste une erreur de validation"
  - id: AC-6
    given: "une requête de listing d'articles"
    when: "sa query est validée"
    then: "elle hérite des défauts de pagination (R-10), accepte les filtres tag, author et favorited, et refuse un filtre vide plutôt que de tout lister"
implementation:
  files:
    - packages/shared/src/model/article.ts
  tests:
    - packages/shared/src/model/article.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-002
    - REQ-PROFILE-001
    - REQ-TAG-001
  adrs: []
---

# REQ-ARTICLE-001 — Représenter et valider l'article et ses entrées

## Contexte

L'`Article` est la forme la plus riche du modèle Conduit, et la seule qui existe
en **deux variantes** : complète à l'unité, allégée en liste. Cette dualité n'est
pas un détail de performance — c'est une règle du contrat (R-7), et un client qui
recevrait le `body` en liste ne s'en plaindrait pas, ce qui rend l'écart
invisible sans validation explicite.

L'auteur d'un article est un `Profile` entier, pas un identifiant : le contrat
évite ainsi au client une requête supplémentaire pour afficher une carte
d'article.

## Règles

- Formats `Article` et `MultipleArticles` : PRD §8, verbatim.
- **R-7** : la forme de liste omet le `body`.
- **R-10** : les défauts de pagination s'appliquent au listing — détaillés dans
  [REQ-ARTICLE-002](REQ-ARTICLE-002.md).
- Un filtre présent mais vide est une erreur, pas un « pas de filtre » : la
  seconde interprétation retournerait tout le catalogue là où l'utilisateur
  attend un sous-ensemble.

## Hors périmètre

- La génération du `slug` depuis le titre et l'unicité associée : logique de
  domaine `apps/api`, slice F3.
- Le calcul de `favorited` / `favoritesCount` : slice F3.
- Le format des tags eux-mêmes : voir [REQ-TAG-001](../tag/REQ-TAG-001.md).
