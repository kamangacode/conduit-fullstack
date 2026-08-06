---
id: REQ-USER-004
title: Consulter et mettre à jour le compte courant
type: functional
domain: user
status: implemented
priority: must
source: "PRD §7.1, §8 (format « User ») ; openapi.yml GET /user et PUT /user"
acceptance_criteria:
  - id: AC-1
    given: "une requête portant un jeton valide"
    when: "GET /api/user est appelé"
    then: "l'API répond 200 avec le compte désigné par le jeton — jamais un autre — et un jeton dans la charge utile"
  - id: AC-2
    given: "une requête sans jeton"
    when: "GET /api/user est appelé"
    then: "l'API répond 401 sans divulguer aucune donnée de compte"
  - id: AC-3
    given: "un compte authentifié et une mise à jour ne portant que sur la bio"
    when: "PUT /api/user est appelé"
    then: "l'API répond 200, la bio est modifiée et les champs absents de la requête gardent leur valeur antérieure"
  - id: AC-4
    given: "un compte authentifié qui soumet un nouveau mot de passe"
    when: "PUT /api/user est appelé puis une connexion est tentée"
    then: "le nouveau mot de passe permet de se connecter et l'ancien produit un 401"
  - id: AC-5
    given: "un autre compte portant déjà l'email visé"
    when: "PUT /api/user tente d'adopter cet email"
    then: "l'API répond 409 et le compte de l'appelant reste inchangé"
  - id: AC-6
    given: "un compte authentifié qui resoumet son propre email et son propre username"
    when: "PUT /api/user est appelé"
    then: "l'API répond 200 — reprendre sa propre valeur n'est pas un conflit d'unicité"
implementation:
  files:
    - apps/api/src/domain/user/user.ts
    - apps/api/src/application/user/get-current-user.use-case.ts
    - apps/api/src/application/user/update-user.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-user.repository.ts
    - apps/api/src/interface/user/user.controller.ts
  tests:
    - apps/api/src/domain/user/user.spec.ts
    - apps/api/src/application/user/get-current-user.use-case.spec.ts
    - apps/api/src/application/user/update-user.use-case.spec.ts
    - apps/api/test/integration/auth-persistence.integration.spec.ts
    - apps/api/test/integration/auth-http.integration.spec.ts
related:
  issues: [5]
  requirements:
    - REQ-USER-001
    - REQ-USER-002
    - REQ-AUTH-001
  adrs: ["009"]
---

# REQ-USER-004 — Consulter et mettre à jour le compte courant

## Contexte

Ces deux endpoints sont les premiers du dépôt à être **protégés** : leur
comportement dépend entièrement de l'identité portée par le jeton. Ils sont donc
l'endroit où se joue la règle de *server-side authority* (rule 19) — le compte lu
ou modifié est celui que désigne le jeton vérifié, jamais un identifiant tiré du
corps de la requête. AC-1 est écrit pour que ce point soit **prouvé**, pas
supposé : un test qui n'utilise qu'un seul compte en base passerait même si
l'implémentation renvoyait le premier utilisateur venu.

La mise à jour partielle porte une subtilité déjà exprimée par le modèle partagé
(REQ-USER-001 AC-5) et qu'il s'agit ici d'honorer côté persistance : un champ
**absent** n'est pas touché, un champ à **`null`** est effacé. Confondre les deux
efface des données que l'utilisateur n'a jamais demandé d'effacer.

AC-6 existe parce que le cas est facile à casser : la vérification d'unicité doit
exclure l'appelant lui-même. Un formulaire de réglages qui renvoie l'intégralité
du profil — ce que fait le front RealWorld de référence — soumet l'email courant à
chaque enregistrement, et se verrait refuser sa propre valeur.

## Règles

- Statut de succès : **200** pour les deux endpoints (`openapi.yml`).
- Absence ou invalidité du jeton : **401** (voir
  [REQ-AUTH-001](../auth/REQ-AUTH-001.md)).
- Conflit d'unicité sur `email` ou `username` : **409**
  ([ADR 009](../../../adr/009-conflit-unicite-409.md)), en excluant le compte de
  l'appelant de la comparaison.
- Échec de forme : **422**, produit par `updateUserRequestSchema` de
  `packages/shared`.
- Un mot de passe fourni est re-haché avec argon2id ; l'ancien condensat est
  remplacé, jamais conservé.
- La réponse porte un jeton, comme toute réponse `User` (PRD §9).

## Hors périmètre

- La suppression de compte : absente du contrat RealWorld.
- L'invalidation des jetons émis avant un changement de mot de passe : impossible
  sans état côté serveur, hors périmètre (voir ADR 007, section Neutral). Un jeton
  émis avant le changement reste donc valide jusqu'à son expiration — c'est une
  limite assumée, pas un oubli.
- Le profil **public** d'un utilisateur : voir
  [REQ-PROFILE-002](../profile/REQ-PROFILE-002.md).
