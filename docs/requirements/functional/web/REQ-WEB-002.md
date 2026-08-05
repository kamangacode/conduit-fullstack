---
id: REQ-WEB-002
title: Porter la session côté client et la réhydrater au démarrage
type: functional
domain: web
status: implemented
priority: must
source: "PRD §9 (jeton en localStorage côté front de référence) ; ADR 012"
acceptance_criteria:
  - id: AC-1
    given: "une connexion ou une inscription réussie"
    when: "la réponse `User` arrive"
    then: "le jeton est conservé et l'utilisateur courant devient disponible pour toute l'application, sans rechargement"
  - id: AC-2
    given: "un jeton conservé lors d'une visite précédente"
    when: "l'application démarre"
    then: "la session est réhydratée depuis le stockage local, sans redemander les identifiants"
  - id: AC-3
    given: "une session ouverte"
    when: "l'utilisateur se déconnecte"
    then: "le jeton est effacé du stockage et l'application repasse en anonyme immédiatement"
  - id: AC-4
    given: "un jeton conservé mais devenu invalide côté API"
    when: "une requête authentifiée répond 401"
    then: "la session est purgée plutôt que laissée dans un état où l'interface se croit connectée"
  - id: AC-5
    given: "un rendu serveur, où le stockage local n'existe pas"
    when: "un composant lit la session"
    then: "il obtient l'état anonyme sans erreur — l'accès au stockage n'a lieu qu'après montage côté client"
implementation:
  files:
    - apps/web/src/lib/session.tsx
    - apps/web/src/lib/api-provider.tsx
    - apps/web/src/lib/api-client.ts
  tests:
    - apps/web/src/lib/session.spec.tsx
    - apps/web/src/lib/api-provider.spec.tsx
related:
  issues: [5]
  requirements:
    - REQ-WEB-001
    - REQ-WEB-004
    - REQ-WEB-006
  adrs:
    - "012"
---

# REQ-WEB-002 — Porter la session côté client et la réhydrater au démarrage

## Contexte

La session est ce que l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)
place délibérément **hors du serveur** : ni cookie, ni session serveur, un jeton
qui ne quitte pas le navigateur. Ce choix rend deux moments critiques — le
démarrage, où il faut retrouver une session existante, et le rendu serveur, où
le stockage n'existe pas.

AC-5 est le critère que cette architecture rend nécessaire et qu'on oublie
naturellement : lire `localStorage` pendant le rendu d'un composant fait planter
le rendu serveur, et le faire pendant le premier rendu client produit une
divergence d'hydratation — React rend un arbre côté serveur, un autre côté
client, et signale une incohérence. La lecture doit donc avoir lieu **après
montage**. Le prix est l'état anonyme transitoire que l'ADR assume.

AC-4 ferme une situation qui, sans elle, se règle par un rechargement manuel :
un jeton expiré reste dans le stockage, l'interface affiche la barre de
navigation connectée, et chaque action échoue en 401 sans que rien n'explique
pourquoi. Purger sur 401 fait de l'API l'autorité sur la validité du jeton — ce
que la rule 10 demande explicitement, le front ne validant jamais le JWT
lui-même.

## Règles

- Le jeton est conservé dans le stockage local du navigateur (PRD §9, front de
  référence).
- Il n'est **jamais** lu directement par un composant : il transite par la
  session, et de là vers `api-client.ts` ([REQ-WEB-001](REQ-WEB-001.md) AC-2).
- `apps/web` ne vérifie pas la signature du jeton : seule l'API fait autorité.
- L'état exposé est minimal — le jeton et le `User` courant, tous deux issus de
  `@repo/shared`.

## Hors périmètre

- Le rafraîchissement de jeton : absent du contrat RealWorld, qui ne prévoit
  qu'un jeton unique sans mécanisme de renouvellement.
- La protection du stockage local contre un script tiers : relève des en-têtes
  (CSP), prévue en Phase 5 (item B8), et non du choix de stockage que le contrat
  impose.
- L'affichage conditionnel de la navigation : [REQ-WEB-006](REQ-WEB-006.md).
