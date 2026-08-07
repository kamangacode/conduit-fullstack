---
id: REQ-WEB-019
title: Une session purgée en cours d'édition ne fait pas disparaître le formulaire
type: functional
domain: web
status: implemented
priority: must
source: "PRD §12 (pages authentifiées) ; suite e2e officielle `error-handling.spec.ts` (401 en cours de soumission) ; ADR 014 (purge sur verdict 4xx)"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur authentifié sur `/editor` avec une saisie en cours"
    when: "l'enregistrement revient en 401 et que la session est purgée"
    then: "l'éditeur reste monté — aucune redirection n'est déclenchée — et `.error-messages` porte le message de session expirée"
  - id: AC-2
    given: "un visiteur qui arrive sur `/editor` sans jeton"
    when: "la session se résout en `anonymous` alors qu'aucun compte n'a été résolu sur cette page"
    then: "il est redirigé vers `/login` — le comportement de REQ-WEB-014 AC-6 est préservé"
  - id: AC-3
    given: "`/editor/:slug` dont l'article est chargé puis modifié"
    when: "un 401 purge la session à l'enregistrement"
    then: "les champs portent toujours les valeurs saisies, et non celles de l'article d'origine"
  - id: AC-4
    given: "la page de paramètres et l'éditeur d'article"
    when: "tous deux subissent une purge de session en cours d'édition"
    then: "ils appliquent la règle depuis une source unique — aucune des deux pages ne porte sa propre copie de la condition de redirection"
  - id: AC-5
    given: "une session purgée en cours d'édition"
    when: "l'application consulte l'état de session publié par le fournisseur"
    then: "celui-ci est redevenu anonyme — la page conserve son formulaire sans prétendre que la session est encore ouverte"
implementation:
  files:
    - apps/web/src/lib/authenticated-page.ts
    - apps/web/src/components/ArticleEditor.tsx
    - apps/web/src/app/settings/page.tsx
  tests:
    - apps/web/src/lib/authenticated-page.spec.tsx
    - apps/web/src/components/ArticleEditor.spec.tsx
related:
  issues: [12]
  requirements:
    - REQ-WEB-002
    - REQ-WEB-004
    - REQ-WEB-014
    - REQ-WEB-016
  adrs: ["012", "014"]
---

# REQ-WEB-019 — Une session purgée en cours d'édition ne fait pas disparaître le formulaire

## Contexte

[REQ-WEB-002](REQ-WEB-002.md) AC-4 pose une règle que ce lot ne rouvre pas : un
401 sur une requête **authentifiée** purge le jeton. C'est la bonne règle —
laisser en place un jeton que l'API vient de refuser fait afficher une identité
qui n'existe plus.

Mais une page authentifiée n'observe de cette purge qu'un passage de `status` à
`anonymous`, et la lecture naturelle de ce passage est « ce visiteur n'a pas de
compte, renvoyons-le à la connexion ». Cette lecture est fausse dans exactement
un cas, et c'est celui qui compte : la session **s'est fermée sous les doigts**
de quelqu'un qui était en train d'écrire.

L'enchaînement observé est le pire possible. La requête part, l'API répond 401,
le message d'explication est bien posé dans l'état de la page — et la
redirection l'emporte avant le rendu suivant. L'auteur voit son travail
disparaître et atterrit sur un formulaire de connexion qui ne lui dit rien. Il
n'a pas ignoré le message : il n'a jamais été affiché.

[REQ-WEB-004](REQ-WEB-004.md) AC-7 a fermé ce défaut **pour la seule page de
paramètres**, en y retenant une copie locale du dernier compte résolu. La règle
existait donc déjà, écrite une fois, dans un fichier — et l'éditeur d'article ne
la portait pas. Cette exigence la sort de sa page d'origine pour en faire la
règle des pages authentifiées : c'est le seul moyen d'éviter que la troisième
page à naître ne la redécouvre par un incident.

## Règles

- **La distinction porte sur l'arrivée, pas sur le statut.** « Anonyme » et
  « aucun compte n'a jamais été résolu sur cette page » ne sont pas la même
  chose. Seule la seconde justifie la redirection.
- **La purge n'est ni retardée ni annulée.** Ce qui change est ce que la **page**
  fait du passage à `anonymous`, jamais le fait que le jeton soit effacé
  ([ADR 014](../../../adr/014-conformite-au-contrat-de-selecteurs-e2e.md)). Une
  page qui garderait son formulaire en prétendant la session encore ouverte
  serait un défaut plus grave que celui qu'on corrige — d'où AC-5.
- **Le compte retenu n'est pas une source de vérité.** Il sert à continuer de
  rendre un formulaire déjà affiché. Toute requête ultérieure repart sans jeton
  et échouera : c'est le comportement attendu, et c'est l'API qui fait autorité.
- **Une seule source.** La condition vit dans un hook partagé
  (`useAuthenticatedAccount`) ; les pages l'appellent, aucune ne la recopie
  (AC-4). C'est ce qui rend l'exigence tenable dans la durée : la prochaine page
  authentifiée hérite du comportement sans que personne ait à s'en souvenir.

## Hors périmètre

- **Le rafraîchissement de jeton** : absent du contrat RealWorld
  ([REQ-WEB-002](REQ-WEB-002.md)).
- **Le rejeu automatique de la soumission échouée** : aucune clé d'idempotence
  en écriture dans le contrat, un rejeu produirait des doublons
  ([REQ-WEB-017](REQ-WEB-017.md)).
- **Le mode indisponible** (5xx, panne de transport, corps illisible), couvert
  par [REQ-WEB-016](REQ-WEB-016.md) : il ne purge rien, donc il ne produit pas
  la transition que cette exigence traite.
- **Le comportement propre de la page de paramètres**, déjà spécifié par
  [REQ-WEB-004](REQ-WEB-004.md) AC-7. Ici, sa règle est **extraite**, pas
  modifiée : ses tests existants en font foi.
