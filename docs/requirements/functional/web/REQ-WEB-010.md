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
implementation:
  files:
    - apps/web/src/lib/pagination.ts
    - apps/web/src/components/Pagination.tsx
  tests:
    - apps/web/src/lib/pagination.spec.ts
    - apps/web/src/components/Pagination.spec.tsx
related:
  issues: [8]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-009
    - REQ-ARTICLE-002
  adrs: []
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

## Règles

- La taille de page vient de `@repo/shared` (`DEFAULT_PAGE_LIMIT`), pas d'une
  constante locale : l'API applique la même, et deux valeurs qui divergent
  produisent des pages qui se chevauchent ou qui sautent des articles.
- Le contrat expose une **page** dans l'URL (`?page=N`) et un **décalage** à
  l'API (`offset`). La conversion se fait à un seul endroit.
- Le markup suit `templates.md` : `ul.pagination`, `li.page-item`, `a.page-link`
  (rule 11), classes que le contrat de sélecteurs E2E vise.

## Hors périmètre

- Le choix de la taille de page par l'utilisateur : absent du contrat RealWorld.
- Le défilement infini : le template de référence pagine, et s'en écarter
  rendrait la comparaison avec les autres implémentations impossible.
- Le contenu de la liste paginée, couvert par [REQ-WEB-011](REQ-WEB-011.md).
