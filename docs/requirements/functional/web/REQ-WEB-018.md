---
id: REQ-WEB-018
title: Garder une page de contenu lisible quand l'API refuse ou ne répond pas
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (routes) ; PRD §10 (404 sur ressource inexistante) ; suite e2e officielle `error-handling.spec.ts`"
acceptance_criteria:
  - id: AC-1
    given: "une route d'article dont le slug n'existe pas"
    when: "la page se rend"
    then: "la coquille `.article-page` est rendue avec un message d'absence, et non une page d'erreur générique"
  - id: AC-2
    given: "une route d'article et une API qui refuse ou ne répond pas (5xx, panne de transport)"
    when: "la page se rend"
    then: "la coquille `.article-page` est rendue avec un message d'indisponibilité, distinct du message d'absence"
  - id: AC-3
    given: "une route de profil dont le username n'existe pas"
    when: "la page se rend"
    then: "la coquille `.profile-page` est rendue avec un message d'absence, sans imbriquer `.user-info` que le sélecteur du contrat rendrait alors ambigu"
  - id: AC-4
    given: "une route de profil et une API qui refuse ou ne répond pas"
    when: "la page se rend"
    then: "la même coquille est rendue avec un message d'indisponibilité"
  - id: AC-5
    given: "l'une de ces quatre coquilles"
    when: "elle se rend"
    then: "elle porte les classes du markup RealWorld que le contrat de sélecteurs vise, et propose un retour vers l'accueil"
implementation:
  files:
    - apps/web/src/components/ArticlePageNotice.tsx
    - apps/web/src/components/ProfilePageNotice.tsx
    - "apps/web/src/app/article/[slug]/not-found.tsx"
    - "apps/web/src/app/article/[slug]/error.tsx"
    - "apps/web/src/app/profile/[username]/not-found.tsx"
    - "apps/web/src/app/profile/[username]/error.tsx"
  tests:
    - apps/web/src/components/PageNotice.spec.tsx
related:
  issues: [11, 12]
  requirements:
    - REQ-WEB-005
    - REQ-WEB-007
    - REQ-WEB-012
    - REQ-WEB-015
  adrs:
    - "012"
---

# REQ-WEB-018 — Garder une page de contenu lisible quand l'API refuse ou ne répond pas

## Contexte

Les pages d'article et de profil sont des Server Components : elles appellent
l'API **pendant le rendu** ([ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)).
Une erreur non rattrapée à cet endroit n'a pas la même conséquence qu'ailleurs —
elle ne laisse pas un bloc vide, elle emporte le rendu de la page entière, et le
visiteur reçoit l'écran d'erreur générique du framework : pas de barre de
navigation, pas de retour possible, aucune indication de ce qu'il s'est passé.

Le dépôt distingue déjà correctement les deux causes côté chargement : un 404 est
un résultat attendu, toute autre erreur remonte, pour ne pas déguiser une API en
rade en « article introuvable ». Ce qui manque est la **sortie** de chacune des
deux branches — l'absence produit aujourd'hui la page 404 du framework, et la
panne produit son écran d'erreur. Dans les deux cas, une page RealWorld a été
remplacée par une page qui ne l'est pas.

La distinction porte jusque dans le statut HTTP, et c'est pourquoi elle est tenue
par deux fichiers de route distincts plutôt que par une branche dans la page : un
slug inconnu répond **404**, une API en rade répond **500**. Confondre les deux
apprendrait à un moteur d'indexation qu'un article existant n'existe pas, pour la
seule raison que la base était indisponible au moment de sa visite.

## Règles

- Un slug ou un username inconnu produit une **vraie** 404
  ([REQ-WEB-005](REQ-WEB-005.md) AC-6) : la coquille rendue ne change pas le
  statut, elle change ce que le visiteur lit.
- Les coquilles suivent le markup RealWorld (rule 11) et portent les classes que
  le contrat de sélecteurs vise (`.article-page`, `.profile-page`) : une page
  d'erreur qui perd ces classes est une page que la suite e2e ne reconnaît plus
  comme la page demandée.
- La coquille de profil **n'imbrique pas** `.user-info`. Le contrat la localise
  par `.profile-page, .user-info`, un sélecteur à deux branches évalué en mode
  strict : porter les deux le rend ambigu et fait échouer les trois tests
  concernés sur « resolved to 2 elements », un message qui ne désigne pas sa
  cause. La page de profil réelle, elle, imbrique bien les deux — c'est le
  gabarit — et aucun test ne l'y localise par ce sélecteur.
- Absence et indisponibilité ne partagent pas leur message. « Cet article
  n'existe pas » affiché pendant une panne est faux, et il l'est au moment où il
  coûte le plus cher.

## Hors périmètre

- Le rejeu automatique du chargement en cas de panne : le visiteur recharge, et
  un rejeu silencieux masquerait la panne à la supervision.
- Les listes d'articles, dont l'échec de préchargement est déjà avalé
  délibérément côté serveur puis repris côté client
  ([REQ-WEB-009](REQ-WEB-009.md)).
- L'état de session pendant une panne d'API : [REQ-WEB-016](REQ-WEB-016.md).
