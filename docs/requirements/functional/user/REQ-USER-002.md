---
id: REQ-USER-002
title: Inscrire un nouvel utilisateur
type: functional
domain: user
status: implemented
priority: must
source: "PRD §7.1, §8 (format « User »), règles R-8 et R-9 ; openapi.yml POST /users"
acceptance_criteria:
  - id: AC-1
    given: "un email et un username qu'aucun compte ne porte, et un mot de passe conforme"
    when: "une inscription est soumise à POST /api/users"
    then: "l'API répond 201 avec l'enveloppe `{ user: … }` portant un jeton exploitable, et sans aucun champ de mot de passe"
  - id: AC-2
    given: "un compte existant portant déjà l'email demandé"
    when: "une inscription réutilise cet email"
    then: "l'API répond 409 avec `errors.email` — le compte existant n'est ni modifié ni écrasé"
  - id: AC-3
    given: "un compte existant portant déjà le username demandé"
    when: "une inscription réutilise ce username"
    then: "l'API répond 409 avec `errors.username`"
  - id: AC-4
    given: "une charge utile dont l'email est malformé ou le mot de passe trop court"
    when: "l'inscription est soumise"
    then: "l'API répond 422 en nommant chaque champ fautif, sans avoir touché la base"
  - id: AC-5
    given: "une inscription qui vient d'aboutir"
    when: "on lit la ligne persistée"
    then: "le mot de passe n'y figure sous aucune forme lisible : seul un condensat argon2id est stocké (R-9)"
implementation:
  files:
    - apps/api/src/application/user/register-user.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-user.repository.ts
    - apps/api/src/infrastructure/security/argon2-password-hasher.ts
    - apps/api/src/interface/user/user.controller.ts
  tests:
    - apps/api/src/application/user/register-user.use-case.spec.ts
    - apps/api/src/infrastructure/security/argon2-password-hasher.spec.ts
    - apps/api/test/integration/auth-persistence.integration.spec.ts
    - apps/api/test/integration/auth-http.integration.spec.ts
related:
  issues: [5]
  requirements:
    - REQ-USER-001
    - REQ-USER-003
    - REQ-ERROR-001
  adrs: ["007", "009"]
---

# REQ-USER-002 — Inscrire un nouvel utilisateur

## Contexte

L'inscription est le seul point d'entrée qui crée un compte, donc le seul endroit
où un mot de passe en clair traverse le système. C'est aussi le premier usage réel
des ports posés par l'[ADR 007](../../../adr/007-authentification-argon2id-jose.md) :
le use-case ne connaît ni argon2 ni jose, il dépend de `PasswordHasher` et de
`TokenService`.

Deux exigences se rejoignent ici et méritent d'être distinguées. **R-9** est une
règle de sécurité — le mot de passe est haché, jamais renvoyé. **R-8** est une
règle d'intégrité — email et username sont uniques. La première se tient dans le
code, la seconde ne peut se tenir que dans la base.

## Règles

- Statut de succès : **201**, conformément à `openapi.yml` (et non 200).
- Violation d'unicité : **409**, corps `{"errors":{"<champ>":["has already been taken"]}}`
  — voir [ADR 009](../../../adr/009-conflit-unicite-409.md).
- Échec de validation de forme : **422** (PRD §10), produit par les schémas Zod de
  `packages/shared` — jamais redéfinis côté API.
- **R-8** : l'unicité est arbitrée par la contrainte `@unique` de PostgreSQL, pas
  par un `SELECT` préalable. Un contrôle en amont laisserait une fenêtre de course
  entre la lecture et l'écriture, pendant laquelle un second appel peut insérer la
  même valeur.
- **R-9** : le hachage est argon2id, paramétré selon l'ADR 007. Le mot de passe
  n'apparaît ni en réponse, ni en log, ni en message d'erreur.

## Hors périmètre

- La **connexion** ultérieure avec ces identifiants : voir
  [REQ-USER-003](REQ-USER-003.md).
- La vérification du jeton produit : voir [REQ-AUTH-001](../auth/REQ-AUTH-001.md).
  Cette exigence demande seulement que le jeton renvoyé soit exploitable, elle ne
  spécifie pas le mécanisme de vérification.
- La confirmation d'adresse email et la politique de mot de passe au-delà de la
  longueur minimale : hors contrat RealWorld.
- Le chiffrement PII at-rest de la colonne `email` (item B5, Phase 5).
