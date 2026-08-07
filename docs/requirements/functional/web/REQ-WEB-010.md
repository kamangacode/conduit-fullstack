---
id: REQ-WEB-010
title: Paginer une liste d'articles à partir du total renvoyé par l'API
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7.3 et règle R-10 (limit/offset) ; templates.md §Home (`.pagination`) ; contrat de sélecteurs E2E (`/?page=N`)"
acceptance_criteria:
  - id: AC-1
    given: "un total d'articles supérieur à la taille d'une page"
    when: "la pagination est rendue"
    then: "le nombre de liens correspond au total **annoncé par l'API**, pas au nombre d'articles reçus"
  - id: AC-2
    given: "un total qui ne tombe pas juste sur un multiple de la taille de page"
    when: "la pagination est rendue"
    then: "la dernière page partielle a son lien — elle n'est pas tronquée par une division entière"
  - id: AC-3
    given: "un total qui tient sur une seule page"
    when: "la pagination est rendue"
    then: "aucun lien de pagination n'est affiché"
  - id: AC-4
    given: "une page courante"
    when: "la pagination est rendue"
    then: "son `.page-item` porte la classe `active`, et lui seul"
  - id: AC-5
    given: "un flux filtré par tag ou un flux personnel"
    when: "l'utilisateur change de page"
    then: "le filtre courant est conservé — changer de page ne ramène pas au flux global"
  - id: AC-6
    given: "une page demandée dans l'URL"
    when: "la liste est chargée"
    then: "le décalage envoyé à l'API est déduit de ce numéro et de la taille de page, la première page valant un décalage nul"
  - id: AC-7
    given: "une liste dont le total dépasse une page"
    when: "la pagination est rendue"
    then: "chaque `.page-item` contient un élément `button` portant le numéro de page, et aucun lien interactif de pagination n'est rendu"
  - id: AC-8
    given: "la page 1 d'une liste paginée sous `/tag/:tag`"
    when: "le lecteur active le bouton « 2 »"
    then: "la cible soumise est `/tag/:tag?page=2` et le `.page-item` du 2 porte la classe `active`"
  - id: AC-9
    given: "l'URL `/tag/:tag?page=2` ouverte directement"
    when: "la liste est chargée"
    then: "les articles de la deuxième page s'affichent et le `.page-item` du 2 porte la classe `active`"
  - id: AC-10
    given: "une taille de page front de 10 et un total de 15 articles"
    when: "les deux pages sont rendues"
    then: "la première contient 10 `.article-preview` et la seconde 5, et la requête envoyée à l'API porte `limit=10`"
  - id: AC-11
    given: "un lecteur sur `/?feed=following&page=2`"
    when: "il active « Global Feed »"
    then: "la cible est `/` exactement — la page repart à 1 plutôt que d'être reportée"
  - id: AC-12
    given: "une liste paginée sur `/?feed=following`"
    when: "le lecteur change de page"
    then: "la cible soumise est `/?feed=following&page=2` — le filtre de flux précède le paramètre de page et n'est pas perdu"
implementation:
  files:
    - apps/web/src/lib/pagination.ts
    - apps/web/src/lib/feed-query.ts
    - apps/web/src/components/Pagination.tsx
    - apps/web/src/components/FeedToggle.tsx
  tests:
    - apps/web/src/lib/pagination.spec.ts
    - apps/web/src/lib/feed-query.spec.ts
    - apps/web/src/components/Pagination.spec.tsx
    - apps/web/src/components/FeedToggle.spec.tsx
    - apps/web/src/components/FeedList.spec.tsx
related:
  issues: [8, 13]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-009
    - REQ-ARTICLE-002
  adrs:
    - "023"
---

# REQ-WEB-010 — Paginer une liste d'articles à partir du total renvoyé par l'API

## Contexte

La pagination est le composant où les erreurs sont **invisibles tant qu'on teste
petit**. C'est la raison d'être de la formulation d'AC-1 et d'AC-2.

AC-1 vise la confusion entre `articlesCount` et `articles.length`. Les deux
coïncident exactement tant que le jeu de données tient sous une page — c'est-à-dire
pendant tout le développement local. Le jour où le site dépasse vingt articles,
la pagination affiche un seul lien et les articles suivants deviennent
inatteignables, sans erreur nulle part. Le même piège a déjà été relevé côté API
lors de F3, où un test posait volontairement un total de 47 pour une page de 2.

AC-2 vise la seconde moitié du même calcul : 41 articles sur des pages de 20 font
**trois** pages, pas deux. Une division entière en produit deux, et les articles
41 à 41 disparaissent — un cas limite qu'un jeu de test rond ne rencontre jamais.

AC-5 ferme un défaut de navigation courant : la pagination reconstruit souvent
son lien à partir du seul numéro de page, perdant le tag ou le flux en cours. Le
symptôme — « je clique sur la page 2 d'un tag et j'atterris sur le flux global » —
se lit comme un bug de filtre alors qu'il vient du lien.

AC-10 est la correction d'un défaut qui masquait tous les autres. Le front
n'envoyait pas `limit`, donc l'API appliquait son défaut (20) et le front
comptait ses pages sur la même valeur : avec 15 articles, il n'existait jamais de
seconde page, et **toutes** les assertions de pagination tombaient — y compris
celles qui portent en apparence sur l'URL.

## Règles

- La taille de page du front est `WEB_PAGE_LIMIT` (10), déclarée dans
  `apps/web/src/lib/pagination.ts`, et **envoyée** en `limit` à chaque requête de
  liste ([ADR 023](../../../adr/023-pagination-formulaire-get-et-taille-de-page.md)).
  C'est l'envoi, et non le partage d'une constante, qui garantit que le front et
  l'API découpent les mêmes articles de la même façon. `DEFAULT_PAGE_LIMIT` de
  `@repo/shared` reste ce que l'API applique quand personne ne demande rien.
- Le contrat expose une **page** dans l'URL (`?page=N`) et un **décalage** à
  l'API (`offset`). La conversion se fait à un seul endroit.
- Le markup suit `templates.md` (`ul.pagination`, `li.page-item`) à un écart
  près, documenté en commentaire du composant (rule 11) et dans l'ADR 023 : le
  contrôle est un `form[method=get] > button.page-link` et non un `a.page-link`,
  parce que le contrat de sélecteurs vise `.pagination button` et
  `.page-item:has(button…)`, et qu'un `<button>` imbriqué dans un `<a>` serait du
  HTML invalide.
- Les filtres courants sont reportés en champs cachés **avant** le bouton :
  l'ordre du DOM est l'ordre de soumission, et c'est lui qui produit
  `/?feed=following&page=2`.
- Le contrôle de la première page ne porte pas de `name` : il n'est donc pas
  soumis, et `/` ne se dédouble pas en `/?page=1`.

## Hors périmètre

- Le choix de la taille de page par l'utilisateur : absent du contrat RealWorld.
- Le défilement infini : le template de référence pagine, et s'en écarter
  rendrait la comparaison avec les autres implémentations impossible.
- Le contenu de la liste paginée, couvert par [REQ-WEB-011](REQ-WEB-011.md).
