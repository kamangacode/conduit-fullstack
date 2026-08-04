---
id: REQ-USER-001
title: Représenter et valider l'utilisateur authentifié
type: functional
domain: user
status: implemented
priority: must
source: "PRD §7.1, §8 (format « User »), règle R-9"
acceptance_criteria:
  - id: AC-1
    given: "une réponse d'authentification produite par l'API"
    when: "elle est validée contre le modèle partagé"
    then: "elle porte email, token, username, bio et image sous l'enveloppe `{ user: … }`, bio pouvant être nulle"
  - id: AC-2
    given: "une charge utile contenant un champ password"
    when: "elle est validée comme réponse utilisateur"
    then: "le mot de passe est refusé en sortie — aucune réponse ne peut le transporter (R-9)"
  - id: AC-3
    given: "une demande d'inscription"
    when: "elle est validée"
    then: "username, email et password sont exigés, le mot de passe respecte la longueur minimale et le username n'est pas vide une fois normalisé"
  - id: AC-4
    given: "une demande de connexion"
    when: "elle est validée"
    then: "l'email doit être bien formé et le mot de passe non vide, sans que la politique de longueur de l'inscription s'applique"
  - id: AC-5
    given: "une mise à jour de profil utilisateur"
    when: "elle est validée"
    then: "tous les champs sont optionnels, un corps vide est accepté, et effacer un champ (null) se distingue de ne pas y toucher (absent)"
implementation:
  files:
    - packages/shared/src/model/user.ts
  tests:
    - packages/shared/src/model/user.spec.ts
related:
  issues: [2]
  requirements:
    - REQ-PROFILE-001
    - REQ-ERROR-001
  adrs: ["001"]
---

# REQ-USER-001 — Représenter et valider l'utilisateur authentifié

## Contexte

`User` est la seule forme du modèle Conduit qui transporte un **secret** : le
token JWT en sortie, le mot de passe en entrée. Sa validation ne relève donc pas
seulement de la conformité au contrat, mais aussi de la sécurité — c'est le
schéma qui rend structurellement impossible qu'un mot de passe se retrouve dans
une réponse.

Cette exigence est écrite **après** l'implémentation : F1 a été livré avant la
pose des rails de la Phase R. Elle documente le comportement réellement couvert
par les tests existants plutôt qu'une intention — c'est une dette de traçabilité
qu'on solde, pas une spécification prospective.

## Règles

- Format `User` : PRD §8, verbatim.
- **R-9** : le mot de passe ne sort jamais de l'API, sous aucune forme.
- Entrées distinctes selon l'usage : l'inscription impose la politique de mot de
  passe, la connexion ne l'impose pas — un compte créé avant un durcissement de
  la politique doit pouvoir continuer à se connecter.

## Hors périmètre

- La **vérification** du JWT et le hachage du mot de passe : mécanismes
  d'infrastructure de `apps/api`, couverts par la slice F2.
- Le chiffrement PII at-rest de l'email (item B5, Phase 5).
- Le profil public d'un utilisateur : voir [REQ-PROFILE-001](../profile/REQ-PROFILE-001.md).
