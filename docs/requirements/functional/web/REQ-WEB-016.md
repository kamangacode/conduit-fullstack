---
id: REQ-WEB-016
title: Distinguer un jeton refusé d'une API injoignable au démarrage
type: functional
domain: web
status: implemented
priority: must
source: "PRD §9 (jeton porté par le front) ; ADR 014 (le 401 purge, la panne réseau non) ; suite e2e officielle `user-fetch-errors.spec.ts`"
acceptance_criteria:
  - id: AC-1
    given: "un jeton conservé et une API qui répond 5xx à la réhydratation du démarrage"
    when: "l'application démarre"
    then: "le jeton est conservé et la session entre en mode indisponible, au lieu de retomber en anonyme"
  - id: AC-2
    given: "un jeton conservé et une API injoignable — aucune réponse, panne de transport"
    when: "l'application démarre"
    then: "le jeton est conservé et la session entre en mode indisponible"
  - id: AC-3
    given: "un jeton conservé et une réponse dont le corps est illisible (JSON malformé, corps vide)"
    when: "l'application démarre"
    then: "le jeton est conservé et la session entre en mode indisponible — un corps illisible n'est pas un verdict sur le jeton"
  - id: AC-4
    given: "la session en mode indisponible"
    when: "la barre de navigation se rend"
    then: "elle annonce la reconnexion en cours plutôt que d'afficher une session ouverte ou une session fermée"
  - id: AC-5
    given: "la session en mode indisponible"
    when: "un outil externe appelle `window.__conduit_debug__.getAuthState()`"
    then: "il obtient `unavailable`, distinct de `loading`, `authenticated` et `unauthenticated`"
  - id: AC-6
    given: "la session en mode indisponible et une API redevenue disponible"
    when: "la tentative suivante aboutit"
    then: "la session s'ouvre sans intervention de l'utilisateur ni rechargement de la page"
  - id: AC-7
    given: "la session en mode indisponible"
    when: "l'utilisateur navigue puis recharge la page"
    then: "le jeton est toujours présent et la tentative reprend — rien n'a été purgé entre-temps"
implementation:
  files:
    - apps/web/src/lib/session.tsx
    - apps/web/src/components/Navbar.tsx
  tests:
    - apps/web/src/lib/session.spec.tsx
    - apps/web/src/components/Navbar.spec.tsx
related:
  issues: [11, 12]
  requirements:
    - REQ-WEB-002
    - REQ-WEB-006
    - REQ-WEB-007
  adrs:
    - "012"
    - "014"
---

# REQ-WEB-016 — Distinguer un jeton refusé d'une API injoignable au démarrage

## Contexte

L'[ADR 014](../../../adr/014-conformite-au-contrat-de-selecteurs-e2e.md) a tranché
la moitié invisible de cette question : la réhydratation du démarrage purge le
jeton sur un **verdict d'autorité** et le conserve sur une **panne de transport**
([REQ-WEB-002](REQ-WEB-002.md) AC-6 et AC-7). Ce que l'application n'a jamais
porté, c'est la moitié **visible** — l'état dans lequel elle se trouve quand elle
conserve un jeton qu'elle n'a pas pu vérifier.

Sans cet état, les deux échecs se ressemblent à l'écran : dans les deux cas
l'interface affiche « Sign in / Sign up », comme si l'utilisateur n'avait pas de
session. Il en conclut que la sienne a expiré, se reconnecte, et le formulaire
échoue lui aussi — parce que le problème n'a jamais été son jeton. Le
`getAuthState()` du contrat de débogage prévoit d'ailleurs `unavailable` et
`loading` depuis l'origine : **aucun des deux n'était atteignable**, ce qui est le
signe d'un état présent dans le contrat et absent du code.

AC-3 est le cas qu'on traite à tort comme une erreur d'authentification : un
corps illisible arrive avec un statut 200, donc l'API n'a rien refusé du tout.
Purger sur ce signal déconnecterait tous les visiteurs pour un défaut de
sérialisation côté serveur.

AC-6 est ce qui rend l'annonce honnête. Un indicateur « reconnexion en cours »
affiché par une application qui n'essaie plus rien est un mensonge d'interface :
l'état ne se rouvrirait qu'au rechargement, que rien n'invite à faire. La
tentative est donc **reprise** tant que la session est indisponible.

## Règles

- Le mode indisponible ne purge **rien** : ni le jeton, ni le cache de requêtes.
  C'est sa raison d'être — la tentative suivante, ou un rechargement ultérieur,
  doit pouvoir retrouver la session.
- Un statut **4xx** sur `GET /user` reste un verdict sur la requête que ce jeton
  a permis d'émettre : il purge ([REQ-WEB-002](REQ-WEB-002.md) AC-6). Le mode
  indisponible ne couvre que ce qui n'est pas un verdict : 5xx, absence de
  réponse, réponse illisible.
- Le vocabulaire exposé au dehors est celui du contrat de sélecteurs
  ([REQ-WEB-007](REQ-WEB-007.md) AC-7) : `loading`, `authenticated`,
  `unauthenticated`, `unavailable`. Aucun nom interne ne fuit par cette
  interface.
- L'application ne devine jamais la validité du jeton qu'elle conserve : elle ne
  lit pas le JWT, elle redemande (rule 10).

## Hors périmètre

- Le **message** affiché par un formulaire soumis pendant une panne de
  transport : [REQ-WEB-017](REQ-WEB-017.md).
- La résilience des pages de contenu rendues côté serveur :
  [REQ-WEB-018](REQ-WEB-018.md).
- Le rafraîchissement de jeton, absent du contrat RealWorld
  ([REQ-WEB-002](REQ-WEB-002.md), hors périmètre).
