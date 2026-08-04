---
id: REQ-PROFILE-001
title: Représenter le profil public d'un utilisateur
type: functional
domain: profile
status: implemented
priority: must
source: "PRD §7.2, §8 (format « Profile »), règle R-5"
acceptance_criteria:
  - id: AC-1
    given: "un profil renvoyé par l'API"
    when: "il est validé contre le modèle partagé"
    then: "il porte username, bio et image sous l'enveloppe `{ profile: … }`, bio et image pouvant être nulles, et un profil sans enveloppe est refusé"
  - id: AC-2
    given: "un profil observé par un utilisateur donné"
    when: "il est validé"
    then: "le champ following est toujours présent et strictement booléen — jamais omis, jamais sérialisé en chaîne (R-5)"
implementation:
  files:
    - packages/shared/src/model/profile.ts
  tests:
    - packages/shared/src/model/profile.spec.ts
related:
  issues: [2]
  requirements:
    - REQ-USER-001
  adrs: []
---

# REQ-PROFILE-001 — Représenter le profil public d'un utilisateur

## Contexte

Le `Profile` est la vue **publique** d'un utilisateur : ce que voient les autres.
Sa particularité est le champ `following`, qui n'est pas un attribut stocké mais
une valeur **relative à l'utilisateur courant** (R-5) — le même profil se
sérialise différemment selon qui le demande.

C'est aussi la raison pour laquelle ce schéma ne reflète pas la table `users`
champ pour champ, et n'a pas vocation à le faire : il décrit une représentation
transportée, pas une ligne de base.

## Règles

- Format `Profile` : PRD §8, verbatim. `bio` et `image` sont nullables
  (contrat OpenAPI officiel : `type: [string, 'null']`).
- **R-5** : `following` est calculé relativement à l'utilisateur courant, et vaut
  `false` pour un visiteur anonyme. Il est **toujours porté**, jamais omis :
  l'absence du champ obligerait chaque client à deviner une valeur par défaut.

## Hors périmètre

- Le calcul de `following` (qui suit qui) : logique de domaine `apps/api`,
  couverte par la slice F2.
- L'utilisateur authentifié et ses secrets : voir [REQ-USER-001](../user/REQ-USER-001.md).
