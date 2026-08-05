---
id: REQ-TAG-002
title: Lister les tags disponibles
type: functional
domain: tag
status: implemented
priority: must
source: "PRD §7.5, §8 (format « Tags ») ; openapi.yml GET /tags"
acceptance_criteria:
  - id: AC-1
    given: "des articles portant des tags"
    when: "GET /api/tags est appelé sans authentification"
    then: "l'API répond 200 avec l'enveloppe `{ tags: [...] }`, un tableau de chaînes simples"
  - id: AC-2
    given: "un même tag porté par plusieurs articles"
    when: "GET /api/tags est appelé"
    then: "le tag n'apparaît qu'une fois dans la liste"
  - id: AC-3
    given: "aucun article publié"
    when: "GET /api/tags est appelé"
    then: "l'API répond 200 avec une liste vide, et non 404"
  - id: AC-4
    given: "un tag dont le dernier article porteur vient d'être supprimé"
    when: "GET /api/tags est rappelé"
    then: "le tag n'est plus proposé : la liste reflète les articles existants, pas l'historique des saisies"
implementation:
  files:
    - apps/api/src/application/tag/list-tags.use-case.ts
    - apps/api/src/infrastructure/persistence/prisma-tag.query.ts
    - apps/api/src/interface/tag/tag.controller.ts
  tests:
    - apps/api/src/application/tag/list-tags.use-case.spec.ts
    - apps/api/test/integration/article-persistence.integration.spec.ts
    - apps/api/test/integration/article-http.integration.spec.ts
related:
  issues: [4]
  requirements:
    - REQ-TAG-001
    - REQ-ARTICLE-003
    - REQ-ARTICLE-006
    - REQ-ARTICLE-007
  adrs: []
---

# REQ-TAG-002 — Lister les tags disponibles

## Contexte

Cet endpoint alimente la sidebar « Popular Tags » de la page d'accueil : il donne
au lecteur les entrées de filtrage utilisables sur
`GET /api/articles?tag=…` ([REQ-ARTICLE-007](../article/REQ-ARTICLE-007.md)).
Sa valeur tient donc entièrement à une propriété : **tout tag proposé doit
ramener au moins un article**. Un tag affiché qui renvoie une liste vide est une
impasse pour l'utilisateur.

AC-4 en découle et fixe le seul point réellement discutable de cette exigence.
Le schéma persiste les tags dans une table propre
([ADR 002](../../../adr/002-modele-donnees-prisma.md)) : rien ne les supprime
quand le dernier article qui les portait disparaît, et une lecture naïve de
`tags` continuerait donc à les proposer. La liste doit être dérivée des tags
**effectivement attachés** à des articles, pas de la table brute. Le critère
n'impose pas la mécanique — purge des tags orphelins ou jointure à la lecture —
seulement le résultat observable.

AC-2 paraît acquis puisque la table porte une contrainte d'unicité sur le nom.
Il ne l'est pas : la liste se construit par jointure sur les articles, où le même
tag apparaît autant de fois qu'il a de porteurs. Le dédoublonnage est un acte de
la requête, pas une propriété héritée du schéma.

L'ordre n'est pas imposé par le contrat. Le nom « Popular Tags » du front suggère
un tri par fréquence, mais la spec ne le demande pas et les autres
implémentations Conduit ne s'accordent pas dessus : on ne l'invente pas ici.

## Règles

- Statut de succès : **200**, sans authentification (`openapi.yml`).
- Format `Tags` : PRD §8, verbatim — `{ "tags": ["reactjs", "angularjs"] }`.
- Un tag est une **chaîne simple**, normalisée à l'écriture
  ([REQ-TAG-001](REQ-TAG-001.md)) : la lecture ne renormalise rien, sans quoi la
  normalisation existerait à deux endroits et divergerait.
- Aucun doublon ; aucun tag sans article porteur.
- Aucun ordre imposé, aucune pagination : le contrat n'en prévoit pas.

## Hors périmètre

- La saisie et la normalisation des tags à la publication :
  [REQ-ARTICLE-003](../article/REQ-ARTICLE-003.md) AC-5 et
  [REQ-TAG-001](REQ-TAG-001.md).
- Le filtrage des articles par tag :
  [REQ-ARTICLE-007](../article/REQ-ARTICLE-007.md) AC-4.
- Un compteur d'usage par tag, un tri par popularité ou une limite du nombre de
  tags renvoyés : absents du contrat RealWorld.
