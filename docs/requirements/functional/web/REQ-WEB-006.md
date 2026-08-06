---
id: REQ-WEB-006
title: Refléter la session dans la barre de navigation
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (navigation) ; markup RealWorld `.navbar`, `.nav-link`"
acceptance_criteria:
  - id: AC-1
    given: "un visiteur anonyme"
    when: "la barre de navigation est rendue"
    then: "elle propose l'accueil, la connexion et l'inscription, et rien qui suppose un compte"
  - id: AC-2
    given: "un utilisateur connecté"
    when: "la barre est rendue"
    then: "elle propose l'accueil, le nouvel article, les paramètres et son profil — ce dernier portant son username"
  - id: AC-3
    given: "la page courante"
    when: "la barre est rendue"
    then: "le lien correspondant porte la classe `active`, comme dans le front de référence"
  - id: AC-4
    given: "une session ouverte puis fermée"
    when: "la déconnexion a lieu"
    then: "la barre repasse aux liens anonymes sans rechargement de page"
  - id: AC-5
    given: "un rendu serveur, où la session n'est pas connue"
    when: "la page est servie"
    then: "la barre est rendue en anonyme et bascule après hydratation, sans divergence d'hydratation signalée par React"
implementation:
  files:
    - apps/web/src/components/Navbar.tsx
    - apps/web/src/app/layout.tsx
  tests:
    - apps/web/src/components/Navbar.spec.tsx
related:
  issues: [7]
  requirements:
    - REQ-WEB-002
    - REQ-WEB-004
  adrs:
    - "012"
---

# REQ-WEB-006 — Refléter la session dans la barre de navigation

## Contexte

La barre de navigation est présente sur toutes les pages et dépend entièrement
du lecteur : c'est donc le composant qui paie le plus visiblement le coût assumé
par l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md) — un bref
état « non connecté » avant hydratation.

AC-5 transforme ce coût en exigence explicite plutôt qu'en surprise. Le piège
n'est pas l'apparence transitoire, c'est la **divergence d'hydratation** : un
composant qui lit le stockage local pendant son premier rendu produit un arbre
différent de celui rendu par le serveur, et React signale une incohérence dans
la console — un avertissement qu'on apprend à ignorer, et qui masque ensuite les
vrais. Rendre l'anonyme des deux côtés, puis basculer après montage, est la seule
forme qui reste silencieuse.

AC-2 lie la barre à la page de paramètres : le lien de profil porte le username,
donc une modification de compte doit s'y refléter
([REQ-WEB-004](REQ-WEB-004.md) AC-4). C'est ce qui impose que la session soit une
source unique partagée, et non une valeur recopiée à l'ouverture de chaque page.

## Règles

- Markup RealWorld : `.navbar`, `.navbar-brand`, `.nav-item`, `.nav-link`, et la
  classe `active` sur le lien courant (rule 11).
- La barre est un **Client Component** : elle dépend de la session.
- Aucune lecture du stockage local pendant le rendu — uniquement après montage
  ([REQ-WEB-002](REQ-WEB-002.md) AC-5).

## Hors périmètre

- Le contenu des pages liées.
- Le lien « New Article », qui pointe vers l'éditeur de la slice F5 : la barre le
  propose, la page arrive plus tard.
- Toute mémorisation de la page d'origine pour y revenir après connexion : le
  front de référence ne le fait pas.
