---
id: REQ-AUTH-001
title: Authentifier les requêtes par jeton préfixé Token
type: functional
domain: auth
status: implemented
priority: must
source: "PRD §9, §10 ; openapi.yml securityScheme « Token »"
acceptance_criteria:
  - id: AC-1
    given: "un en-tête `Authorization: Token <jwt valide>`"
    when: "une route protégée est appelée"
    then: "la requête est traitée pour le compte désigné par le sujet du jeton"
  - id: AC-2
    given: "un en-tête `Authorization: Bearer <jwt valide>`"
    when: "une route protégée est appelée"
    then: "l'API répond 401 — le contrat impose le préfixe `Token`, un jeton par ailleurs valide ne suffit pas"
  - id: AC-3
    given: "un jeton expiré, ou signé avec un autre secret"
    when: "une route protégée est appelée"
    then: "l'API répond 401 et la charge utile du jeton n'est jamais exploitée"
  - id: AC-4
    given: "aucun en-tête d'autorisation"
    when: "une route protégée est appelée"
    then: "l'API répond 401"
  - id: AC-5
    given: "aucun en-tête d'autorisation"
    when: "une route à authentification optionnelle est appelée"
    then: "la requête est traitée en anonyme, sans erreur"
  - id: AC-6
    given: "un jeton correctement signé dont le sujet ne correspond à aucun compte"
    when: "une route protégée est appelée"
    then: "l'API répond 401 — une signature valide ne vaut pas existence du compte"
implementation:
  files:
    - apps/api/src/domain/user/ports/token-service.port.ts
    - apps/api/src/infrastructure/security/jose-token.service.ts
    - apps/api/src/interface/auth/auth.guard.ts
    - apps/api/src/interface/auth/current-user.decorator.ts
  tests:
    - apps/api/src/infrastructure/security/jose-token.service.spec.ts
    - apps/api/test/integration/auth-http.integration.spec.ts
related:
  issues: [5]
  requirements:
    - REQ-USER-003
    - REQ-USER-004
    - REQ-PROFILE-002
  adrs: ["007"]
---

# REQ-AUTH-001 — Authentifier les requêtes par jeton préfixé Token

## Contexte

Le contrat RealWorld impose `Authorization: Token <jwt>` — et non `Bearer`, qui
est pourtant l'usage dominant et ce qu'extraient par défaut la plupart des
bibliothèques d'authentification. C'est la raison directe pour laquelle
l'[ADR 007](../../../adr/007-authentification-argon2id-jose.md) écarte Passport :
il aurait fallu écrire l'extracteur de toute façon.

AC-2 est donc un critère de **conformité**, pas de sécurité : accepter `Bearer`
serait plus permissif et ne créerait aucune faille, mais rendrait le dépôt
non conforme à un contrat que la suite Hurl (F7) vérifie.

AC-6 couvre le cas qu'on oublie le plus volontiers, parce qu'il semble
impossible : un jeton bien signé dont le compte a disparu. Il survient dès qu'un
compte est supprimé alors que des jetons émis sont encore valides. Une
implémentation qui ferait confiance au seul `sub` sans le résoudre en base
laisserait alors un fantôme agir avec l'identité d'un compte inexistant.

La distinction entre routes **protégées** et routes à **authentification
optionnelle** (AC-5) n'est pas un confort : plusieurs endpoints du contrat
adaptent leur réponse selon la présence d'un jeton — `following` sur un profil
(R-5), `favorited` sur un article. Le traiter comme deux comportements distincts
d'un même mécanisme évite un guard qui refuserait ce qu'il devrait tolérer.

## Règles

- Préfixe accepté : **`Token`** exclusivement (PRD §9). La comparaison porte sur le
  premier segment de l'en-tête, séparé par une espace.
- Toute défaillance d'authentification produit **401** : en-tête absent, préfixe
  incorrect, jeton malformé, signature invalide, jeton expiré, sujet non résolu.
- Le jeton est vérifié par le port `TokenService`, jamais décodé à la main : lire
  la charge utile sans en vérifier la signature est la faille classique du JWT.
- Sur une route à authentification optionnelle, un jeton **invalide** est traité
  comme une absence de jeton : la requête est servie en anonyme plutôt que
  refusée. Le contrat ne prévoit pas de 401 sur ces routes.
- L'identité obtenue est la seule source d'autorité pour la suite du traitement
  (rule 19) — aucun identifiant d'utilisateur n'est jamais lu dans le corps.

## Hors périmètre

- L'**émission** du jeton : voir [REQ-USER-002](../user/REQ-USER-002.md) et
  [REQ-USER-003](../user/REQ-USER-003.md).
- La révocation, la liste de jetons invalidés et le rafraîchissement : hors
  contrat RealWorld (ADR 007, section Neutral).
- La limitation de débit sur les échecs d'authentification : item B8, Phase 5.
- Le stockage du jeton côté client (`localStorage`) : relève de `apps/web`,
  slice F4.
