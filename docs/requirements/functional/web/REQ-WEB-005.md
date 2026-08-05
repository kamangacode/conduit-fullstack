---
id: REQ-WEB-005
title: Consulter un profil public et suivre son auteur
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (route /profile/:username), §7.2, règle R-5 ; markup RealWorld `.profile-page`"
acceptance_criteria:
  - id: AC-1
    given: "un username existant et un visiteur anonyme"
    when: "la page de profil est demandée"
    then: "le HTML rendu par le serveur porte déjà le username, la bio et l'image — sans attendre l'exécution du JavaScript"
  - id: AC-2
    given: "un visiteur anonyme"
    when: "la page est rendue"
    then: "le bouton de suivi apparaît comme non suivi (R-5), et l'actionner conduit à la page de connexion plutôt qu'à un appel refusé"
  - id: AC-3
    given: "un utilisateur connecté qui ne suit pas ce profil"
    when: "il actionne le bouton de suivi"
    then: "le bouton bascule en « suivi » et l'état est persisté côté API"
  - id: AC-4
    given: "un utilisateur qui suit déjà ce profil"
    when: "il actionne le bouton"
    then: "il cesse de suivre, et le bouton revient à son état initial"
  - id: AC-5
    given: "un utilisateur consultant son propre profil"
    when: "la page est rendue"
    then: "le bouton de suivi est remplacé par le lien vers ses paramètres, comme dans le front de référence"
  - id: AC-6
    given: "un username que ne porte aucun compte"
    when: "la page est demandée"
    then: "une page 404 est rendue, et non un profil vide"
implementation:
  files:
    - apps/web/src/components/FollowButton.tsx
    - apps/web/src/app/profile/[username]/page.tsx
  tests:
    - apps/web/src/components/FollowButton.spec.tsx
related:
  issues: [5]
  requirements:
    - REQ-WEB-001
    - REQ-WEB-002
    - REQ-PROFILE-002
    - REQ-PROFILE-003
  adrs:
    - "012"
---

# REQ-WEB-005 — Consulter un profil public et suivre son auteur

## Contexte

C'est la première page où la frontière de l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)
devient visible, et elle est ici justifiée par le contrat lui-même : le profil
est **public** — username, bio, image sont identiques pour tout le monde — tandis
que `following` est **relatif au lecteur** (R-5). La page se coupe donc
exactement là où le contrat se coupe : contenu rendu côté serveur en anonyme
(AC-1), bouton de suivi hydraté côté client (AC-3, AC-4).

AC-2 traite le visiteur anonyme sans lui mentir. Deux mauvaises réponses sont
possibles : masquer le bouton, ce qui s'écarte du front de référence et prive
l'utilisateur de l'information « on peut suivre ici » ; ou l'afficher et laisser
l'appel partir, pour recevoir un 401 que l'interface devra traduire. Rediriger
vers la connexion est la seule réponse qui reste conforme au markup **et** utile.

AC-5 reprend un détail du front de référence qui n'est pas cosmétique : sans
lui, un utilisateur voit un bouton « Follow » sur son propre profil, l'actionne,
et l'API accepte — le contrat n'interdit pas l'auto-suivi
([REQ-PROFILE-003](../profile/REQ-PROFILE-003.md)). L'interface est donc le seul
endroit où ce non-sens peut être évité, et elle l'évite en n'offrant pas
l'action.

## Règles

- Route : `/profile/:username` (PRD §5).
- Contenu public rendu côté serveur, appel API **sans jeton** (ADR 012).
- **R-5** : `following` vaut `false` pour un anonyme ; l'état affiché après
  hydratation est celui que l'API renvoie pour le lecteur.
- Markup RealWorld : `.profile-page`, `.user-info`, `.action-btn` (rule 11).
- Username inconnu : 404 ([REQ-PROFILE-002](../profile/REQ-PROFILE-002.md) AC-3).

## Hors périmètre

- Les onglets « My Articles » et « Favorited Articles » du profil : ils listent
  des articles et relèvent de la slice F5, avec le reste des listes.
- L'édition de son propre profil : [REQ-WEB-004](REQ-WEB-004.md).
- La relation de suivi côté API : [REQ-PROFILE-003](../profile/REQ-PROFILE-003.md).
