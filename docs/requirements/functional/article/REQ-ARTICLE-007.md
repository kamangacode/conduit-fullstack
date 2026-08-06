---
id: REQ-ARTICLE-007
title: Lister et filtrer les articles publiés
type: functional
domain: article
status: implemented
priority: must
source: "PRD §7.3, §8 (format « MultipleArticles »), règles R-2, R-3, R-5, R-7 et R-10 ; openapi.yml GET /articles"
acceptance_criteria:
  - id: AC-1
    given: "plusieurs articles publiés à des dates différentes"
    when: "GET /api/articles est appelé sans filtre"
    then: "l'API répond 200 avec les articles triés du plus récent au plus ancien (R-2)"
  - id: AC-2
    given: "une liste d'articles renvoyée"
    when: "la réponse est validée"
    then: "aucun article ne porte de `body` (R-7), et tous les autres champs du format §8 sont présents"
  - id: AC-3
    given: "plus d'articles que la page demandée"
    when: "GET /api/articles?limit=2&offset=2 est appelé"
    then: "l'API renvoie la tranche demandée, tandis que `articlesCount` porte le total avant pagination, pas la taille de la page"
  - id: AC-4
    given: "des articles portant des tags différents"
    when: "GET /api/articles?tag=dragons est appelé"
    then: "seuls les articles portant ce tag sont renvoyés, et `articlesCount` compte le sous-ensemble filtré"
  - id: AC-5
    given: "des articles de plusieurs auteurs, dont certains favorisés"
    when: "GET /api/articles?author=jake puis ?favorited=jake sont appelés"
    then: "le premier renvoie les articles écrits par jake, le second ceux qu'il a favorisés — deux ensembles distincts"
  - id: AC-6
    given: "les filtres tag et author combinés"
    when: "GET /api/articles?tag=dragons&author=jake est appelé"
    then: "les filtres se cumulent en conjonction, et non en alternative"
  - id: AC-7
    given: "un appelant authentifié qui suit un auteur et a favorisé un article"
    when: "GET /api/articles est appelé avec son jeton"
    then: "`favorited` et `author.following` sont calculés pour chaque article de la page relativement à lui (R-5)"
  - id: AC-8
    given: "un filtre author ou favorited désignant un username inexistant"
    when: "GET /api/articles est appelé"
    then: "l'API répond 200 avec une liste vide et `articlesCount` à 0, plutôt qu'une erreur ou le catalogue entier"
implementation:
  files:
    - apps/api/src/application/article/list-articles.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-article.query.ts
    - apps/api/src/interface/article/article.controller.ts
  tests:
    - apps/api/src/application/article/read-articles.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [6]
  requirements:
    - REQ-ARTICLE-001
    - REQ-ARTICLE-002
    - REQ-ARTICLE-008
    - REQ-PROFILE-001
  adrs:
    - "011"
---

# REQ-ARTICLE-007 — Lister et filtrer les articles publiés

## Contexte

Le listing global alimente la page d'accueil de Conduit, et c'est l'endpoint qui
concentre le plus de règles du PRD : le tri (R-2), les filtres (R-3), la
relativité au lecteur (R-5), l'omission du `body` (R-7) et la pagination (R-10).
Aucune de ces règles n'est visible dans une réponse prise isolément — une liste
non triée, un `articlesCount` erroné ou un `favorited` toujours faux produisent
tous une réponse **bien formée**. C'est pourquoi chaque règle a ici son critère.

AC-3 verrouille la confusion la plus coûteuse : `articlesCount` est le total
**avant** pagination, pas `articles.length`. Les deux coïncident tant qu'on teste
avec moins d'articles qu'une page, ce qui rend l'erreur invisible en
développement et cassante en production — le front en déduit son nombre de pages.

AC-5 sépare deux filtres qu'un nom rapproche : `author=jake` désigne ce que jake
a **écrit**, `favorited=jake` ce qu'il a **aimé**. Les deux prennent un username,
les deux renvoient des articles, et une implémentation qui les confondrait
passerait un test écrit à la va-vite sur un jeu de données où jake a favorisé ses
propres articles.

AC-8 fixe le comportement sur un filtre qui ne correspond à personne. Renvoyer
une liste vide plutôt qu'un 404 est cohérent avec la nature de l'endpoint — une
recherche sans résultat n'est pas une ressource absente — et surtout, ne pas
retomber silencieusement sur « pas de filtre » : ce dernier comportement
renverrait le catalogue entier à qui demandait un sous-ensemble.

AC-7, appliqué à chaque article de la page, est ce qui motive
[ADR 011](../../../adr/011-lecture-des-listes-port-dedie.md) : la résolution en
une requête, plutôt qu'une boucle qui interrogerait la base par article.

## Règles

- Statut de succès : **200** ; format `MultipleArticles` : PRD §8, verbatim.
- **R-2** : tri par date de création décroissante.
- **R-3** : `tag`, `author` et `favorited` se combinent avec `limit` / `offset`.
- **R-5** : `favorited` et `author.following` sont relatifs à l'appelant, `false`
  pour un anonyme.
- **R-7** : la forme de liste omet le `body`.
- **R-10** : `limit` vaut 20 et `offset` vaut 0 par défaut
  ([REQ-ARTICLE-002](REQ-ARTICLE-002.md)).
- L'authentification est optionnelle ; un jeton absent produit un listing
  anonyme, pas une erreur.

## Hors périmètre

- Le flux personnel, qui a ses propres règles d'appartenance et exige
  l'authentification : [REQ-ARTICLE-008](REQ-ARTICLE-008.md).
- La validation des bornes de `limit` / `offset`, portée par
  [REQ-ARTICLE-002](REQ-ARTICLE-002.md).
- Toute recherche plein texte, tri alternatif ou pagination par curseur : absents
  du contrat RealWorld.
- Le `body` : il n'est disponible que sur l'article unitaire
  ([REQ-ARTICLE-004](REQ-ARTICLE-004.md)).
