---
id: REQ-WEB-009
title: Présenter la page d'accueil avec ses onglets de flux et ses tags populaires
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (routes) et §7.3 ; templates.md §Home ; contrat de sélecteurs E2E (routes `/`, `/?feed=following`, `/tag/:tag`)"
acceptance_criteria:
  - id: AC-1
    given: "un visiteur anonyme sur la page d'accueil"
    when: "la page s'affiche"
    then: "seul l'onglet « Global Feed » est proposé, et il est marqué actif"
  - id: AC-2
    given: "un utilisateur connecté sur la page d'accueil"
    when: "la page s'affiche"
    then: "l'onglet « Your Feed » apparaît en plus, et devient l'onglet actif par défaut"
  - id: AC-3
    given: "un visiteur anonyme qui atteindrait le flux personnel par l'URL"
    when: "la page résout le flux demandé"
    then: "elle retombe sur le flux global plutôt que d'émettre un appel qui reviendrait en 401"
  - id: AC-4
    given: "la liste des tags populaires"
    when: "un tag est choisi"
    then: "un troisième onglet portant ce tag apparaît et devient actif, sans faire disparaître les deux autres"
  - id: AC-5
    given: "un flux qui ne contient aucun article"
    when: "la page s'affiche"
    then: "elle rend le message d'absence du contrat plutôt qu'une liste vide muette"
  - id: AC-6
    given: "la barre latérale des tags"
    when: "l'API des tags échoue ou n'en renvoie aucun"
    then: "la page reste utilisable et le flux s'affiche — la barre latérale ne fait pas échouer la page"
implementation:
  files:
    - apps/web/src/lib/feed-query.ts
    - apps/web/src/components/FeedToggle.tsx
    - apps/web/src/components/FeedList.tsx
    - apps/web/src/components/PopularTags.tsx
    - apps/web/src/app/home-page.tsx
    - apps/web/src/app/page.tsx
    - "apps/web/src/app/tag/[tag]/page.tsx"
  tests:
    - apps/web/src/lib/feed-query.spec.ts
    - apps/web/src/components/FeedToggle.spec.tsx
    - apps/web/src/components/FeedList.spec.tsx
    - apps/web/src/components/PopularTags.spec.tsx
related:
  issues: [8]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-010
    - REQ-WEB-011
    - REQ-TAG-001
  adrs:
    - "012"
    - "015"
---

# REQ-WEB-009 — Présenter la page d'accueil avec ses onglets de flux et ses tags populaires

## Contexte

La page d'accueil est la seule du parcours à composer **trois sources** : le flux
global, le flux personnel et les tags populaires. C'est aussi la première page
où la frontière serveur/client de l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)
se joue sur du contenu de liste et non sur un fragment isolé.

AC-3 est le critère qu'une implémentation plausible oublie. Les onglets sont
conditionnés à la session, donc « Your Feed » n'est pas affiché à un anonyme — et
on en conclut trop vite que le flux personnel est inatteignable. Il l'est par
l'URL, que le contrat de sélecteurs E2E rend explicite (`/?feed=following`). Sans
repli, un visiteur anonyme qui la suit déclenche un appel authentifié sans jeton,
reçoit un 401, et voit une page en erreur là où le comportement attendu est
banal : lui montrer le flux global.

AC-6 tient à la nature de la barre latérale : elle est **décorative pour le
parcours**. Un échec de `GET /tags` ne doit pas empêcher de lire les articles,
alors qu'un appel non isolé le ferait — c'est le genre de couplage qu'on ne
remarque pas tant que l'API répond.

## Règles

- Le flux personnel passe par l'endpoint dédié, jamais par un filtre de la liste
  globale ([REQ-WEB-008](REQ-WEB-008.md) AC-4).
- L'onglet actif porte la classe `active` du template — le CSS de référence s'en
  sert pour marquer la position, et son absence rend la navigation illisible sans
  rien casser d'autre.
- Le markup suit `templates.md` §Home : `.home-page`, `.banner`, `.feed-toggle`,
  `.sidebar`, `.tag-list` (rule 11).
- L'état du flux courant vit dans l'**URL**, pas dans un état local : c'est ce
  qui rend une page de flux partageable et ce que le contrat E2E décrit.

## Hors périmètre

- La pagination, couverte par [REQ-WEB-010](REQ-WEB-010.md).
- Le rendu d'un aperçu d'article et la bascule de favori, couverts par
  [REQ-WEB-011](REQ-WEB-011.md).
- La page d'un tag comme route propre (`/tag/:tag`) : elle réutilise la même
  composition et n'ajoute pas de comportement, elle est traitée avec cette
  exigence.
