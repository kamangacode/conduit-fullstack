---
id: REQ-PROFILE-003
title: Suivre et ne plus suivre un utilisateur
type: functional
domain: profile
status: implemented
priority: must
source: "PRD §7.2, règle R-5 ; openapi.yml POST et DELETE /profiles/{username}/follow"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur authentifié et une cible qu'il ne suit pas"
    when: "POST /api/profiles/:username/follow est appelé"
    then: "l'API répond 200 avec `following` à true, et la relation est persistée"
  - id: AC-2
    given: "une cible que l'appelant suit déjà"
    when: "POST /api/profiles/:username/follow est rappelé"
    then: "l'API répond 200 avec `following` à true et la base ne porte toujours qu'une seule relation"
  - id: AC-3
    given: "une cible que l'appelant suit"
    when: "DELETE /api/profiles/:username/follow est appelé"
    then: "l'API répond 200 avec `following` à false, et la relation ne subsiste pas en base"
  - id: AC-4
    given: "une cible que l'appelant ne suit pas"
    when: "DELETE /api/profiles/:username/follow est appelé"
    then: "l'API répond 200 avec `following` à false, sans erreur"
  - id: AC-5
    given: "aucun jeton d'authentification"
    when: "POST ou DELETE /api/profiles/:username/follow est appelé"
    then: "l'API répond 401 et aucune relation n'est créée ni supprimée"
  - id: AC-6
    given: "un username que ne porte aucun compte"
    when: "POST /api/profiles/:username/follow est appelé avec un jeton valide"
    then: "l'API répond 404"
implementation:
  files:
    - apps/api/src/domain/profile/ports/follow-repository.port.ts
    - apps/api/src/application/profile/follow-user.use-case.ts
    - apps/api/src/application/profile/unfollow-user.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-follow.repository.ts
    - apps/api/src/interface/profile/profile.controller.ts
  tests:
    - apps/api/src/application/profile/follow-user.use-case.spec.ts
    - apps/api/src/application/profile/unfollow-user.use-case.spec.ts
    - apps/api/test/integration/auth-persistence.integration.spec.ts
    - apps/api/test/integration/auth-http.integration.spec.ts
related:
  issues: [5]
  requirements:
    - REQ-PROFILE-001
    - REQ-PROFILE-002
    - REQ-AUTH-001
  adrs: []
---

# REQ-PROFILE-003 — Suivre et ne plus suivre un utilisateur

## Contexte

Le suivi est la première **écriture relationnelle** du dépôt : elle ne crée pas
une ressource propre mais un lien orienté entre deux comptes. Elle conditionne le
flux personnel (`/feed`, règle R-4) de la slice F3, qui n'aura de sens que si
cette relation est fiable.

Le point structurant est l'**idempotence** (AC-2 et AC-4). Le contrat ne définit
pas de code d'erreur pour « tu suis déjà cette personne » : l'endpoint exprime un
état voulu — *je veux suivre* — pas une transition. Un double clic, un rejeu
réseau ou un client optimiste ne doivent donc produire ni doublon ni erreur.
Cette propriété n'est pas obtenue par un contrôle applicatif préalable mais par la
**clé composite** `(followerId, followingId)` du schéma Prisma : c'est la base qui
rend le doublon impossible, et l'adapter qui traite la collision comme un succès.

AC-4 est le symétrique côté suppression : retirer un lien absent est un
non-événement, pas un 404. Le 404 d'AC-6 porte sur la **cible inconnue**, ce qui
est une situation entièrement différente — un username qui ne désigne personne.

Le cas « se suivre soi-même » n'est pas spécifié par le contrat RealWorld. Aucun
critère ne le couvre donc ici, délibérément : inventer une règle que la suite de
conformité ne vérifie pas ajouterait un comportement propre à ce dépôt, qu'un
client écrit pour la spec ne pourrait pas anticiper.

## Règles

- Statut de succès : **200** sur les deux verbes ; jeton absent : **401** ;
  username inconnu : **404** (`openapi.yml`).
- La réponse est le **profil de la cible** après l'opération, avec `following`
  reflétant le nouvel état (R-5).
- L'appelant (le suiveur) est toujours dérivé du jeton vérifié, jamais du corps
  ni de l'URL (rule 19, server-side authority).
- L'unicité de la relation est portée par la clé composite du modèle `Follow`,
  pas par un `SELECT` préalable — même raisonnement que pour R-8
  ([ADR 009](../../../adr/009-conflit-unicite-409.md)) : un contrôle en amont
  laisserait une fenêtre de course.

## Hors périmètre

- La **lecture** de la relation lors de la consultation d'un profil : voir
  [REQ-PROFILE-002](REQ-PROFILE-002.md).
- Le flux personnel qui consomme cette relation (R-4) : slice F3.
- Le blocage d'un utilisateur, la réciprocité, les demandes de suivi : absents du
  contrat RealWorld.
- Le comportement de l'auto-suivi, non spécifié par le contrat (voir Contexte).
