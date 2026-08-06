---
id: REQ-WEB-008
title: Étendre le client API aux articles, commentaires et tags
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7.3, §7.4, §7.5 (endpoints articles, commentaires, tags) ; §8 (enveloppes) ; règles R-7, R-10"
acceptance_criteria:
  - id: AC-1
    given: "une demande de liste d'articles sans aucun filtre"
    when: "le client construit la requête"
    then: "l'URL ne porte aucun paramètre vide — un filtre absent est omis, pas envoyé à blanc"
  - id: AC-2
    given: "une demande de liste filtrée par tag, auteur ou favori, avec pagination"
    when: "le client construit la requête"
    then: "chaque filtre fourni apparaît en paramètre de requête, encodé, sous le nom du contrat"
  - id: AC-3
    given: "une réponse de liste dont le total dépasse la page demandée"
    when: "le client la déballe"
    then: "il rend les articles **et** `articlesCount`, qui est le total avant pagination et non la taille de la page"
  - id: AC-4
    given: "le flux personnel de l'utilisateur connecté"
    when: "le client le demande"
    then: "il interroge l'endpoint dédié `/articles/feed`, jamais la liste globale avec un filtre"
  - id: AC-5
    given: "un article, un slug ou un username contenant un caractère à encoder"
    when: "le client construit le chemin"
    then: "le segment est encodé — un slug n'est jamais concaténé brut dans l'URL"
  - id: AC-6
    given: "une suppression d'article ou de commentaire"
    when: "l'API répond 204 sans corps"
    then: "le client termine sans erreur de lecture de corps"
  - id: AC-7
    given: "une bascule de favori"
    when: "le client l'envoie"
    then: "il rend l'article renvoyé par l'API, dont `favorited` et `favoritesCount` font foi"
  - id: AC-8
    given: "les commentaires d'un article"
    when: "le client les liste, en publie un ou en supprime un"
    then: "les trois opérations passent par le chemin imbriqué de l'article et rendent les types partagés"
  - id: AC-9
    given: "la création puis la modification d'un article"
    when: "le client les envoie"
    then: "la création poste sur la collection et la modification vise le slug, toutes deux dans l'enveloppe `{ article: … }` du contrat"
implementation:
  files:
    - apps/web/src/lib/api-client.ts
  tests:
    - apps/web/src/lib/api-client.spec.ts
related:
  issues: [8]
  requirements:
    - REQ-WEB-001
    - REQ-ARTICLE-002
    - REQ-ARTICLE-004
  adrs: []
---

# REQ-WEB-008 — Étendre le client API aux articles, commentaires et tags

## Contexte

`lib/api-client.ts` couvre aujourd'hui le compte et les profils
([REQ-WEB-001](REQ-WEB-001.md)). Les pages de la slice F5 — accueil, article,
éditeur — ont besoin du reste du contrat : articles, favoris, commentaires,
tags.

Cette exigence est délibérément posée **avant** les pages qui la consomment,
parce que c'est le seul endroit où les erreurs de transport se traitent une fois
pour toutes. Une page qui construit son URL elle-même finit par le faire
légèrement différemment de la suivante, et la divergence n'apparaît qu'au
paramètre qu'une seule des deux encode.

AC-1 et AC-3 visent les deux pannes que ce genre de client produit sans bruit.
Un filtre envoyé à blanc (`?tag=`) n'est pas équivalent à un filtre absent : côté
API il désigne le tag vide, donc une liste vide, et la page affiche « aucun
article » pour un flux qui en contient. `articlesCount` confondu avec
`articles.length` produit, lui, une pagination correcte tant qu'on teste sous la
taille d'une page — puis une seule page affichée pour un site qui en a douze.

AC-4 ferme une confusion de lecture du contrat : le flux personnel **est un
endpoint**, pas un filtre de la liste globale. Un routage vers `/articles`
répondrait tout le site, bien formé et entièrement faux.

## Règles

- Aucun type Conduit n'est redéfini ici : tout vient de `@repo/shared`, comme
  pour les endpoints déjà couverts (architecture §6).
- Le client **transporte**, il n'interprète pas : traduire un 404 en « article
  introuvable » ou un 403 en message est le travail de l'appelant
  ([REQ-WEB-001](REQ-WEB-001.md)).
- Les listes rendent la forme sans `body` (`ArticleSummary`, règle R-7) et les
  endpoints unitaires l'article complet. Les confondre ferait afficher un corps
  vide dans un aperçu, ou compiler un rendu Markdown sur une valeur absente.
- La pagination suit le contrat : `limit` et `offset`, valeurs par défaut de
  `@repo/shared` (règle R-10).

## Hors périmètre

- L'affichage, la mise en cache et le rafraîchissement : ce module ne connaît ni
  React ni TanStack Query. Les pages qui le consomment sont couvertes par
  [REQ-WEB-009](REQ-WEB-009.md) et suivantes.
- L'éditeur d'article et sa validation de formulaire, qui feront l'objet d'une
  exigence propre au moment où la page sera écrite : ici, seul le transport.
- La validation des entrées : elle appartient aux schémas partagés, appliqués
  par les formulaires avant l'appel.
