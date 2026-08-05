---
id: REQ-WEB-007
title: Exposer le contrat de sélecteurs attendu par la suite E2E partagée
type: functional
domain: web
status: approved
priority: must
source: "specifications/frontend/tests.md et styles.md (contrat specs/e2e/SELECTORS.md du dépôt RealWorld) ; ADR 014"
acceptance_criteria:
  - id: AC-1
    given: "le formulaire de connexion ou d'inscription"
    when: "un test localise un champ par son attribut `name`"
    then: "il trouve `email`, `password` et — à l'inscription — `username`, aux noms exacts du contrat"
  - id: AC-2
    given: "le formulaire de paramètres"
    when: "un test localise un champ par son attribut `name`"
    then: "il trouve `image`, `username`, `bio`, `email` et `password`, la bio étant un `textarea`"
  - id: AC-3
    given: "un utilisateur dont `image` est absent ou vide"
    when: "son avatar est affiché, quel qu'en soit l'emplacement"
    then: "la source de l'image contient `default-avatar.svg` plutôt que d'être vide ou absente"
  - id: AC-4
    given: "un utilisateur dont `image` porte une URL"
    when: "son avatar est affiché"
    then: "c'est cette URL qui est utilisée, l'avatar par défaut ne servant que de repli"
  - id: AC-5
    given: "une session ouverte"
    when: "un test lit le stockage local"
    then: "la clé `jwtToken` contient la chaîne JWT seule, et aucune autre clé ne porte la session"
  - id: AC-6
    given: "l'application chargée dans un navigateur"
    when: "un test appelle `window.__conduit_debug__`"
    then: "l'interface expose `getToken()`, `getAuthState()` et `getCurrentUser()`"
  - id: AC-7
    given: "l'interface de débogage"
    when: "la session est respectivement en cours de résolution, ouverte, puis anonyme"
    then: "`getAuthState()` rapporte `loading`, `authenticated` puis `unauthenticated`, les noms du contrat"
  - id: AC-8
    given: "un utilisateur connecté"
    when: "la barre de navigation affiche son lien de profil"
    then: "elle porte une image de classe `user-pic`, et les liens éditeur et paramètres portent leurs icônes `ion-*`"
implementation:
  files: []
  tests: []
related:
  issues: [5]
  requirements:
    - REQ-WEB-002
    - REQ-WEB-003
    - REQ-WEB-004
    - REQ-WEB-005
    - REQ-WEB-006
  adrs:
    - "014"
---

# REQ-WEB-007 — Exposer le contrat de sélecteurs attendu par la suite E2E partagée

## Contexte

RealWorld publie une **suite Playwright partagée** par toutes les
implémentations frontend. C'est l'équivalent, côté web, de ce que la suite Hurl
est pour l'API : la preuve mécanique qu'on a construit un clone comparable aux
autres, et non une application qui lui ressemble.

Cette suite n'est pas exécutable contre un markup arbitraire. Elle localise les
éléments par attribut `name`, par classe CSS, par texte visible, et interroge
une interface de débogage normalisée. Le document qui fixe tout cela est le
**contrat de sélecteurs** (`specs/e2e/SELECTORS.md`), auquel
`specifications/frontend/tests.md` renvoie explicitement.

Cette exigence existe parce que **la conformité au contrat n'est pas un
sous-produit du markup RealWorld** : les pages construites en F4 suivent déjà les
classes de `templates.md` et pourtant aucun de leurs champs ne porte
d'attribut `name`, la session n'utilise pas la clé attendue, et l'interface de
débogage n'existe pas. Rien ne le signalait, parce que rien ne l'exigeait — les
tests unitaires localisent les champs par leur libellé accessible, ce qui est
correct et ne dit rien du contrat.

Les décisions de fond qu'elle applique — clé de stockage, réhydratation,
exposition permanente de l'interface de débogage — sont motivées dans
l'[ADR 014](../../../adr/014-conformite-au-contrat-de-selecteurs-e2e.md).

## Règles

- Les attributs `name`, les classes et les textes viennent du contrat, **au mot
  près**. Un nom approchant ne se voit pas en développement et fait échouer la
  suite plus tard, sur un symptôme qui ne désigne pas sa cause.
- L'avatar par défaut est **vendoré** dans `public/`, comme le thème : le contrat
  demande que la source *contienne* `default-avatar.svg`, ce qu'un CDN tiers ne
  garantirait pas dans la durée.
- L'interface de débogage est en **lecture seule** : elle rapporte l'état, elle
  ne permet pas de le modifier. Une interface qui ouvrirait une session
  deviendrait un vecteur, là où lire ne donne accès à rien que le même script ne
  puisse déjà lire.
- Les noms d'état sont ceux du contrat (`loading`, `authenticated`,
  `unauthenticated`), même si le vocabulaire interne de la session diffère : la
  traduction se fait à la frontière, une seule fois.

## Hors périmètre

- **L'exécution de la suite Playwright elle-même** : c'est l'item F7, et elle
  suppose des pages qui n'existent pas encore (flux, article, éditeur). Cette
  exigence rend son exécution possible, elle ne la réalise pas.
- Les sélecteurs des **pages non construites** — `.article-preview`,
  `.comment-form`, `.pagination`, `.empty-feed-message`, `.editor-page` — qui
  arriveront avec les pages qui les portent (item F5).
- Le mécanisme de session lui-même, couvert par
  [REQ-WEB-002](REQ-WEB-002.md) : cette exigence ne porte que sur ce que le
  contrat en rend observable.
- L'état `unavailable` du contrat de débogage, prévu pour les implémentations
  incapables de déterminer leur état d'authentification. La session en est
  toujours capable, donc il n'est jamais rapporté.
