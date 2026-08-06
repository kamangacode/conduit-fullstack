---
id: REQ-TAG-001
title: Normaliser et représenter les tags
type: functional
domain: tag
status: implemented
priority: must
source: "PRD §7.5, §8 (format « Tags »)"
acceptance_criteria:
  - id: AC-1
    given: "un tag reçu de l'extérieur"
    when: "il est validé contre le modèle partagé"
    then: "ses espaces de bord sont normalisés, et un tag vide ou fait uniquement d'espaces est refusé"
  - id: AC-2
    given: "la liste des tags de l'application"
    when: "elle est validée"
    then: "elle prend la forme `{ tags: [...] }`, accepte d'être vide, et un tableau nu sans enveloppe est refusé"
implementation:
  files:
    - packages/shared/src/model/tag.ts
  tests:
    - packages/shared/src/model/tag.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-001
  adrs: []
---

# REQ-TAG-001 — Normaliser et représenter les tags

## Contexte

Le tag est l'objet le plus simple du modèle, et pourtant celui où l'absence de
normalisation coûte le plus cher. Sans elle, `"dragons"` et `" dragons"` sont
deux tags distincts : le nuage de tags en affiche deux, le filtre par tag n'en
trouve qu'un, et la duplication est irréversible une fois les articles publiés.

La normalisation appartient donc au **schéma partagé**, pas à l'API : `apps/web`
et `apps/api` doivent appliquer exactement la même règle, faute de quoi la
duplication réapparaît selon le chemin d'entrée.

## Règles

- Format `Tags` : PRD §8, verbatim — une enveloppe, jamais un tableau nu.
- Espaces de bord retirés ; un tag vide après normalisation est refusé.
- Une liste vide est valide : c'est l'état d'une application qui n'a encore
  aucun article tagué, pas une anomalie.

## Hors périmètre

- L'unicité globale des tags en base et leur association aux articles : slice F3.
- Le filtrage d'articles par tag : voir [REQ-ARTICLE-001](../article/REQ-ARTICLE-001.md).
