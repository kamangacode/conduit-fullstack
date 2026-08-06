---
id: REQ-COMMENT-001
title: Représenter et valider le commentaire d'article
type: functional
domain: comment
status: implemented
priority: must
source: "PRD §7.4, §8 (formats « Comment » et « MultipleComments »)"
acceptance_criteria:
  - id: AC-1
    given: "un commentaire porteur d'un identifiant"
    when: "il est validé contre le modèle partagé"
    then: "l'identifiant est un entier — un UUID, un entier transporté en chaîne ou un décimal sont refusés (ADR 004)"
  - id: AC-2
    given: "un commentaire renvoyé par l'API"
    when: "il est validé"
    then: "il porte le format §8 complet, avec un Profile entier en auteur comme l'article"
  - id: AC-3
    given: "la liste des commentaires d'un article"
    when: "elle est validée"
    then: "elle prend la forme `{ comments: [...] }`, accepte d'être vide, et n'expose aucun compteur — la spec ne pagine pas les commentaires"
  - id: AC-4
    given: "une demande d'ajout de commentaire"
    when: "elle est validée"
    then: "le body est exigé non vide après normalisation, l'enveloppe `{ comment: … }` est respectée, et tout auteur envoyé par le client est ignoré"
implementation:
  files:
    - packages/shared/src/model/comment.ts
  tests:
    - packages/shared/src/model/comment.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-ARTICLE-001
    - REQ-PROFILE-001
  adrs: ["004", "002"]
---

# REQ-COMMENT-001 — Représenter et valider le commentaire d'article

## Contexte

Le commentaire est le seul objet du modèle dont l'identifiant est un **entier**
et non un UUID. Ce n'est pas une inconséquence : le contrat officiel RealWorld
déclare `type: integer`, et c'est la confrontation du modèle partagé à ce
contrat qui a fait remonter la divergence avec le schéma de persistance initial
— d'où l'[ADR 004](../../../adr/004-persistance-alignee-sur-le-contrat.md), qui
amende l'ADR 002.

Le second point sensible est l'auteur. Il vient du token vérifié, jamais du
corps de la requête. Le schéma d'entrée l'ignore donc explicitement : accepter
un champ `author` du client, même sans l'utiliser, laisserait croire à un
lecteur du code que la valeur pourrait être prise en compte un jour.

## Règles

- Formats `Comment` et `MultipleComments` : PRD §8, verbatim.
- Identifiant **entier** (ADR 004).
- **Server-side authority** (rule 19) : l'auteur est dérivé du JWT vérifié, ce
  que le schéma d'entrée rend structurel en n'offrant aucun champ pour le porter.
- Pas de pagination des commentaires, donc pas de compteur dans l'enveloppe.

## Hors périmètre

- La suppression d'un commentaire et son contrôle d'appartenance (404 plutôt que
  403, rule 19) : slice F3.
- La pagination : voir [REQ-ARTICLE-002](../article/REQ-ARTICLE-002.md), qui ne
  s'applique pas ici.
