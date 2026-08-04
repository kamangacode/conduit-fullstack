---
id: REQ-ERROR-001
title: Produire un contrat d'erreur uniforme
type: functional
domain: error
status: implemented
priority: must
source: "PRD §10 (erreurs), règle R-8"
acceptance_criteria:
  - id: AC-1
    given: "les codes d'erreur métier déclarés par le modèle partagé"
    when: "on les confronte à la table des statuts"
    then: "chacun est associé au statut HTTP de la spec §10, et la couverture est exhaustive — aucun code déclaré sans statut"
  - id: AC-2
    given: "une valeur présentée comme code d'erreur métier"
    when: "elle est validée"
    then: "les codes déclarés sont acceptés, un code inconnu est refusé, et un statut HTTP passé à la place du code métier est refusé"
  - id: AC-3
    given: "une réponse d'erreur de l'API"
    when: "elle est validée"
    then: "elle suit la forme §10 verbatim — un objet de champs vers des tableaux de messages, refusant un message seul ou un tableau vide"
  - id: AC-4
    given: "une erreur de validation Zod"
    when: "elle est convertie en réponse d'erreur"
    then: "les messages sont indexés par nom de champ, regroupés quand ils visent le même champ, aplatis en clé pointée pour un chemin imbriqué, et rattachés à une clé racine quand l'erreur ne vise aucun champ"
  - id: AC-5
    given: "une règle métier violée, par exemple l'unicité de l'email (R-8)"
    when: "on construit sa réponse d'erreur"
    then: "l'enveloppe produite est conforme au contrat, avec un ou plusieurs messages pour un même champ"
implementation:
  files:
    - packages/shared/src/errors/error-codes.ts
    - packages/shared/src/errors/validation-errors.ts
  tests:
    - packages/shared/src/errors/error-codes.spec.ts
    - packages/shared/src/errors/validation-errors.spec.ts
related:
  issues: [2]
  requirements:
    - REQ-USER-001
  adrs: []
---

# REQ-ERROR-001 — Produire un contrat d'erreur uniforme

## Contexte

Le format d'erreur de RealWorld est inhabituel — un objet dont chaque clé est un
champ et chaque valeur un **tableau** de messages — et c'est précisément ce qui
le rend facile à trahir. Renvoyer `{ errors: { email: "déjà pris" } }` au lieu de
`{ errors: { email: ["déjà pris"] } }` produit une réponse qui a l'air correcte,
que le client affiche mal, et dont la cause se cherche côté front.

Écrire ce format une seule fois, dans le modèle partagé, avec la conversion
depuis une erreur Zod, est ce qui garantit que chaque endpoint le respecte sans
avoir à y penser.

La table code métier → statut HTTP vit ici pour la même raison : c'est le seul
endroit où l'on peut vérifier qu'elle est **exhaustive**. Un code déclaré sans
statut donnerait un 500 là où la spec attend un 422.

## Règles

- Format d'erreur : PRD §10, verbatim.
- Chaque code métier déclaré a un statut HTTP associé — vérifié exhaustivement.
- **R-8** : l'unicité de l'email et du username produit une erreur de champ, pas
  une erreur générique.
- Un chemin Zod imbriqué est aplati en clé pointée : le client reçoit une clé
  qu'il peut rapprocher d'un champ de formulaire.

## Hors périmètre

- Le **mapping** des erreurs de domaine vers les codes HTTP côté serveur
  (`domain-exception.filter.ts`) : infrastructure `apps/api`, slice F2.
- Les erreurs d'infrastructure non métier (base indisponible, timeout) : elles
  ne passent pas par ce contrat.
