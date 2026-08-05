---
id: REQ-ARTICLE-006
title: Supprimer son propre article
type: functional
domain: article
status: approved
priority: must
source: "PRD §7.3, règle R-6 ; openapi.yml DELETE /articles/{slug}"
acceptance_criteria:
  - id: AC-1
    given: "un article et son auteur authentifié"
    when: "DELETE /api/articles/:slug est appelé"
    then: "l'API répond 204 sans corps, et une lecture ultérieure du slug répond 404"
  - id: AC-2
    given: "un article portant des commentaires et des favoris"
    when: "il est supprimé"
    then: "ses commentaires et ses favoris disparaissent avec lui, sans laisser de ligne orpheline en base"
  - id: AC-3
    given: "un article appartenant à un autre utilisateur"
    when: "DELETE /api/articles/:slug est appelé avec un jeton valide"
    then: "l'API répond 403 et l'article existe toujours"
  - id: AC-4
    given: "un slug inconnu"
    when: "DELETE /api/articles/:slug est appelé"
    then: "l'API répond 404"
  - id: AC-5
    given: "aucun jeton"
    when: "DELETE /api/articles/:slug est appelé"
    then: "l'API répond 401 et l'article existe toujours"
implementation:
  files: []
  tests: []
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-004
    - REQ-ARTICLE-005
    - REQ-COMMENT-004
  adrs:
    - "008"
---

# REQ-ARTICLE-006 — Supprimer son propre article

## Contexte

La suppression pose la même question de permission que la modification
([REQ-ARTICLE-005](REQ-ARTICLE-005.md)) — même règle R-6, même 403, même ordre de
vérification — mais elle en ajoute une que la modification n'a pas : celle des
**ressources rattachées**.

Un article supprimé laisse derrière lui des commentaires et des favoris qui
n'ont plus de sujet. AC-2 exige leur disparition. Le schéma Prisma prévoit déjà
`onDelete: Cascade` sur `comments.articleId` et `favorites.articleId`, mais une
contrainte déclarée n'est une garantie qu'une fois vérifiée : le critère existe
parce qu'un adapter pourrait tout aussi bien supprimer par une requête qui
contourne la cascade, ou parce qu'une migration future pourrait la retirer sans
que rien ne le signale.

Ce critère est aussi celui qui justifie que la suppression soit **réelle** et non
un marquage logique. Un `deletedAt` obligerait chaque lecture — listes, feed,
tags, commentaires — à porter un filtre supplémentaire, et le premier endroit qui
l'oublierait ferait réapparaître l'article. Le contrat RealWorld ne demande
aucune corbeille ; on ne l'invente pas.

## Règles

- Statut de succès : **204** sans corps (`openapi.yml`) — pas de `{ article: … }`
  en écho, contrairement au favori.
- **R-6** : seul l'auteur supprime son article ; sinon **403**
  ([ADR 008](../../../adr/008-permission-manquante-403.md)).
- Slug inconnu : **404**, vérifié avant la permission.
- Jeton absent ou invalide : **401**.
- La suppression est définitive : aucun marquage logique, aucune restauration.

## Hors périmètre

- La suppression d'un commentaire seul :
  [REQ-COMMENT-004](../comment/REQ-COMMENT-004.md).
- Le devenir des tags devenus inutilisés après la suppression du dernier article
  qui les portait : traité par [REQ-TAG-002](../tag/REQ-TAG-002.md), qui définit
  ce que `GET /api/tags` renvoie.
- La suppression d'un compte utilisateur et de ses articles : absente du contrat
  RealWorld.
