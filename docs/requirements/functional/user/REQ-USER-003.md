---
id: REQ-USER-003
title: Authentifier un utilisateur par mot de passe
type: functional
domain: user
status: implemented
priority: must
source: "PRD §7.1, §9 ; openapi.yml POST /users/login"
acceptance_criteria:
  - id: AC-1
    given: "un compte existant et le mot de passe qui lui correspond"
    when: "une connexion est soumise à POST /api/users/login"
    then: "l'API répond 200 avec l'enveloppe `{ user: … }` et un jeton dont le sujet désigne ce compte"
  - id: AC-2
    given: "un compte existant et un mot de passe erroné"
    when: "la connexion est soumise"
    then: "l'API répond 401 et ne renvoie aucun jeton"
  - id: AC-3
    given: "un email que ne porte aucun compte"
    when: "la connexion est soumise"
    then: "l'API répond 401 avec exactement le même corps que pour un mot de passe erroné — rien ne permet de distinguer les deux cas"
  - id: AC-4
    given: "une charge utile sans email, ou dont l'email est malformé"
    when: "la connexion est soumise"
    then: "l'API répond 422 en nommant le champ fautif"
implementation:
  files:
    - apps/api/src/application/user/login-user.use-case.ts
    - apps/api/src/infrastructure/security/argon2-password-hasher.ts
    - apps/api/src/interface/user/user.controller.ts
  tests:
    - apps/api/src/application/user/login-user.use-case.spec.ts
    - apps/api/src/infrastructure/security/argon2-password-hasher.spec.ts
    - apps/api/test/integration/auth-http.integration.spec.ts
related:
  issues: [5]
  requirements:
    - REQ-USER-001
    - REQ-USER-002
    - REQ-ERROR-001
  adrs: ["007"]
---

# REQ-USER-003 — Authentifier un utilisateur par mot de passe

## Contexte

La connexion est le point où le système décide qui est l'appelant. Son intérêt de
spécification ne tient pas au chemin nominal — vérifier un condensat est trivial —
mais au **chemin de refus**, qui porte deux risques distincts.

Le premier est l'**énumération de comptes** : si un email inconnu produit une
réponse différente d'un mot de passe erroné, l'API devient un oracle qui répond à
« ce compte existe-t-il ? » sans authentification. C'est l'objet d'AC-3, et c'est
le critère le plus facile à casser par inadvertance — un `if (!user) throw new
NotFoundError()` écrit sans y penser suffit.

Le second est la **politique de mot de passe appliquée au mauvais endroit**. Le
schéma de connexion n'exige pas la longueur minimale de l'inscription (voir
[REQ-USER-001](REQ-USER-001.md) AC-4) : un compte créé avant un durcissement de la
politique doit continuer à pouvoir se connecter, avec un 401 s'il se trompe et non
un 422 de validation.

## Règles

- Statut de succès : **200** (`openapi.yml`).
- Identifiants invalides : **401**, quelle que soit la raison réelle.
- Échec de forme : **422**, produit par `loginRequestSchema` de `packages/shared`.
- La comparaison du mot de passe passe par le port `PasswordHasher`, dont
  l'implémentation argon2id compare à temps constant
  ([ADR 007](../../../adr/007-authentification-argon2id-jose.md)).
- Le jeton porte l'identifiant du compte dans `sub`, et rien d'autre : un JWT est
  signé, pas chiffré, donc lisible par quiconque l'intercepte.

## Hors périmètre

- La **création** du compte : voir [REQ-USER-002](REQ-USER-002.md).
- La vérification du jeton sur les requêtes suivantes : voir
  [REQ-AUTH-001](../auth/REQ-AUTH-001.md).
- La limitation du nombre de tentatives (rate limiting) : item B8, Phase 5. Cette
  exigence ne prétend donc **pas** protéger contre le bourrage d'identifiants ;
  elle garantit seulement que l'API ne divulgue pas l'existence d'un compte.
- La révocation et le renouvellement de jeton : hors contrat RealWorld
  (voir ADR 007, section Neutral).
