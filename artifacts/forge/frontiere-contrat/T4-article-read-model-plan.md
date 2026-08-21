---
ref: T4
titre: article — port de lecture applicatif, read model et mapper
tier: F-full
vague: 2
depend_de: [T3]
statut: planifie
---

# T4 — Le lot qui répond au commentaire

## 1. Problème

C'est le fichier cité par la revue publique. `domain/article/ports/article-query.port.ts` :

- importe `Article` et `ArticleSummary` depuis `@repo/shared` (ligne 1) ;
- déclare renvoyer « directement les projections du contrat partagé » (ligne 53) ;
- connaît `GET /api/articles` (ligne 16) et `/feed` (ligne 27) ;
- raisonne sur « la forme publique d'un username » (ligne 19).

Quatre connaissances de transport dans un fichier de `domain/`. La question posée en revue est la
bonne : ce port n'appartient pas au domaine. Il ne porte aucune règle métier, aucun invariant,
aucun agrégat. Il sert un cas d'usage d'affichage. C'est un **port applicatif de lecture**, placé
dans `domain/` parce que la convention disait que les ports vivent là.

Les 7 use cases d'article prolongent le défaut : ils renvoient `Article` ou `ArticlesResponse`,
c'est-à-dire l'enveloppe HTTP `{ articles, articlesCount }`. `articlesCount` est un nom du
contrat, pas un concept métier.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `application/article/ports/article-query.port.ts` | créé, déplacé depuis `domain/article/ports/` |
| `application/article/ports/article-view.ts` | créé : read model possédé par le dépôt |
| `domain/article/ports/article-query.port.ts` | supprimé |
| `application/article/*.use-case.ts` (7) | signatures de sortie en read model |
| `infrastructure/persistence/prisma-article.query.ts` | remplit le read model |
| `interface/article/article.mapper.ts` | créé : read model vers DTO et enveloppe |
| `interface/article/article.controller.ts` | appelle le mapper |
| `interface/article/article.module.ts` | jeton d'injection déplacé |
| `domain/comment/ports/comment-repository.port.ts` | `ViewerId` réimporté depuis application |

## 3. Décisions

**Le read model est possédé par le dépôt, et il est en types du domaine.**

```ts
// application/article/ports/article-view.ts
export interface ArticleView {
  readonly slug: string
  readonly title: string
  readonly description: string
  readonly body: string
  readonly tagList: readonly string[]
  readonly createdAt: Date        // <- Date, pas chaîne ISO
  readonly updatedAt: Date
  readonly favorited: boolean
  readonly favoritesCount: number
  readonly author: AuthorView
}

export type ArticleSummaryView = Omit<ArticleView, 'body'>

export interface ArticleListPage {
  readonly items: readonly ArticleSummaryView[]
  readonly total: number
}
```

`createdAt: Date` est le point qui prouve que le découplage est réel. La chaîne ISO est la forme
du fil, pas celle du métier. C'est le mapper qui sérialise.

**`ViewerId` déménage avec le port.** Il est aujourd'hui déclaré dans le port d'article et importé
par le port de commentaire, ce qui crée une arête `domain/comment` vers `domain/article` que
personne n'a voulue. Il devient `application/shared/viewer-id.ts`, importé par les deux.

**Le N+1 n'est pas réintroduit.** L'adapter Prisma garde sa requête unique et son calcul en base
de `following`, `favorited` et `favoritesCount`. Il remplit `ArticleView` au lieu de `Article` :
la différence est le type de retour, pas la stratégie d'accès. C'est la seule chose que l'ADR 011
défendait vraiment.

**Ce qu'on perd, et pourquoi c'est acceptable.** Le raccourci « le type du port produit le format
§8, donc un écart casse la compilation » disparaît. Cette garantie se déplace vers le mapper, qui
est typé `(view: ArticleView) => Article`. Elle reste doublée par le harnais de contrat de
l'[ADR 026](../../../docs/adr/026-tests-de-contrat-assertion-symetrique-et-intercepteur.md),
qui asserte la forme sur toutes les routes et qui, lui, ne bouge pas.

**Les use cases renvoient le read model, pas l'enveloppe.** `ListArticlesUseCase` renvoie
`ArticleListPage`. Le controller appelle `toArticlesResponse(page)` qui produit
`{ articles, articlesCount }`. Le use case cesse d'être un passe-plat qui renomme un champ.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `apps/api/src/domain/article/` ne contient plus aucun import de `@repo/shared`.
- **AC-2** : `apps/api/src/application/article/` ne contient plus aucun import de `@repo/shared`.
- **AC-3** : `grep -rn "api/articles\|/feed" apps/api/src/domain/` ne retourne rien. Le domaine ne
  connaît plus aucune route.
- **AC-4** : `ArticleView.createdAt` est de type `Date`. La sérialisation ISO n'existe que dans
  `interface/article/article.mapper.ts`.
- **AC-5** : un listing de N articles déclenche **une seule** requête. Vérifié par le test
  d'intégration existant sur `prisma-article.query.ts`, qui doit rester vert sans modification de
  son assertion de comptage.
- **AC-6** : `pnpm conformance` et `pnpm conformance:e2e` verts. Aucune réponse ne change de
  forme, y compris `POST /api/articles` qui relit par ce port.
- **AC-7** : le compteur `domain-owns-its-model` descend de 4 à 3, `application-owns-its-io` de
  17 à 10.
- **AC-8** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm knip` verts.

## 5. Slices

1. Créer `application/shared/viewer-id.ts` et `application/article/ports/article-view.ts`.
2. Déplacer le port, réécrire ses signatures sur le read model, supprimer l'ancien.
3. Adapter `prisma-article.query.ts` (projection vers `ArticleView`).
4. Écrire `interface/article/article.mapper.ts` et son test.
5. Basculer les 7 use cases, puis le controller et le module.

## 6. Hors-scope

- Les commentaires, bien que `article.controller.ts` porte aussi leurs routes (T5).
- Toute optimisation de requête. Le SQL généré ne doit pas changer.
- La séparation lecture/écriture elle-même, qui reste celle de l'ADR 011.
