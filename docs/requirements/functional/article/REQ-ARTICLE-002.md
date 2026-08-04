---
id: REQ-ARTICLE-002
title: Paginer les listes d'articles
type: functional
domain: article
status: implemented
priority: must
source: "PRD §11, règle R-10"
acceptance_criteria:
  - id: AC-1
    given: "une requête de listing sans paramètre de pagination"
    when: "sa query est validée"
    then: "les défauts de limit et offset de la règle R-10 s'appliquent, et ces défauts sont exposés comme constantes réutilisables plutôt que réécrits à chaque appel"
  - id: AC-2
    given: "des paramètres de pagination issus d'une query string"
    when: "ils sont validés"
    then: "ils sont convertis en nombres — une query string ne transporte que des chaînes"
  - id: AC-3
    given: "un paramètre de pagination invalide (zéro, négatif, décimal ou non numérique)"
    when: "il est validé"
    then: "il est refusé explicitement, jamais remplacé en silence par la valeur par défaut"
implementation:
  files:
    - packages/shared/src/model/pagination.ts
  tests:
    - packages/shared/src/model/pagination.spec.ts
related:
  issues: [2]
  requirements:
    - REQ-ARTICLE-001
  adrs: []
---

# REQ-ARTICLE-002 — Paginer les listes d'articles

## Contexte

La pagination est traitée comme une exigence à part parce qu'elle est
**transverse** : le listing global, le feed personnalisé et les listes filtrées
partagent les mêmes paramètres. Un schéma unique évite que trois endpoints
divergent lentement sur leurs bornes ou leurs défauts.

Le point sensible est le comportement en cas de valeur invalide. Retomber
silencieusement sur le défaut est le réflexe courant, et c'est un piège : le
client reçoit une page valide, croit que son paramètre a été pris en compte, et
le bug se manifeste bien plus tard, sous forme de résultats incohérents que rien
ne relie à la requête d'origine.

## Règles

- **R-10** : `limit` et `offset` ont des valeurs par défaut documentées.
- Une valeur invalide produit une erreur de validation, jamais une substitution.
- Les défauts sont exportés comme constantes : le front et l'API affichent la
  même taille de page sans se coordonner à la main.

## Hors périmètre

- La pagination des commentaires : la spec RealWorld ne pagine pas les
  commentaires, voir [REQ-COMMENT-001](../comment/REQ-COMMENT-001.md).
- L'exécution de la requête paginée côté base : slice F3.
