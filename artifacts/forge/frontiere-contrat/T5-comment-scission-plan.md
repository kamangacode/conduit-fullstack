---
ref: T5
titre: comment — scinder écriture (domaine) et lecture (application)
tier: F-lite
vague: 2
depend_de: [T3, T4]
statut: planifie
---

# T5 — Un fichier, deux ports, deux couches

## 1. Problème

`domain/comment/ports/comment-repository.port.ts` déclare **deux ports dans un seul fichier**, et
ils n'appartiennent pas à la même couche :

- `CommentRepository` (écriture) manipule `CommentEntity`. Il est à sa place dans `domain/`.
- `CommentQueryPort` (lecture) renvoie `readonly Comment[]`, c'est-à-dire le DTO du contrat, avec
  l'auteur résolu en `Profile`. C'est un port applicatif de lecture.

Le fichier importe donc `Comment` depuis `@repo/shared` pour la moitié de son contenu, ce qui
suffit à faire du fichier entier un consommateur du contrat. Il importe aussi `ViewerId` depuis
`domain/article/ports/`, créant une arête `domain/comment` vers `domain/article` qui n'a pas de
justification métier (T4 la supprime en déplaçant `ViewerId`).

Les 2 use cases de commentaire renvoient `Comment` et `CommentsResponse`.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `domain/comment/ports/comment-repository.port.ts` | ne garde que `CommentRepository` et `NewComment` |
| `application/comment/ports/comment-query.port.ts` | créé : `CommentQueryPort` déplacé |
| `application/comment/ports/comment-view.ts` | créé : read model |
| `application/comment/*.use-case.ts` (3) | signatures de sortie en read model |
| `infrastructure/persistence/prisma-comment.repository.ts` | remplit le read model |
| `interface/article/comment.mapper.ts` | créé : read model vers DTO et enveloppe |
| `interface/article/article.controller.ts` | appelle le mapper pour les routes de commentaire |
| `interface/article/article.module.ts` | jeton `COMMENT_QUERY` déplacé |

## 3. Décisions

**Scinder le fichier, pas seulement déplacer un type.** Le fichier actuel documente lui-même la
séparation (« Port d'**écriture** », « Port de **lecture**, symétrique de `ArticleQueryPort` »).
Elle est correcte sur le fond ; seul l'emplacement du second est faux. Après T5, deux fichiers,
deux couches, et le commentaire d'en-tête n'a plus à expliquer pourquoi ils cohabitent.

**Le read model suit exactement la forme de T4.**

```ts
export interface CommentView {
  readonly id: number
  readonly body: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly author: AuthorView   // réutilisé depuis application/article/ports/article-view.ts
}
```

`AuthorView` est partagé avec T4 et non redéclaré. Le déclarer deux fois recréerait exactement la
divergence que l'ADR 001 cherchait à éviter, un étage plus bas.

**La liste reste ni paginée ni comptée.** Le port actuel le dit et cite REQ-COMMENT-003 AC-1. Ce
lot ne touche pas à cette propriété : `listByArticle` renvoie `readonly CommentView[]`, et c'est
le mapper qui produit l'enveloppe `{ comments: [...] }`.

**`findById` garde ses deux signatures homonymes dans deux ports différents.** Côté écriture,
`findById(id): Promise<CommentEntity | null>` sert le contrôle d'appartenance. Côté lecture,
`findById(id, viewer): Promise<CommentView | null>` sert la relecture après création. Ce sont
deux questions distinctes, et la scission des fichiers rend enfin l'homonymie lisible.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `apps/api/src/domain/comment/` ne contient plus aucun import de `@repo/shared`.
- **AC-2** : `apps/api/src/application/comment/` ne contient plus aucun import de `@repo/shared`.
- **AC-3** : `domain/comment/` n'importe plus rien depuis `domain/article/`.
- **AC-4** : `CommentView.author` est le `AuthorView` de T4, pas un type redéclaré. Une seule
  déclaration dans le dépôt.
- **AC-5** : `pnpm conformance` vert. `GET /api/articles/:slug/comments` renvoie la même forme,
  sans pagination ni compteur ajoutés.
- **AC-6** : le compteur `domain-owns-its-model` descend de 3 à 2, `application-owns-its-io` de
  10 à 8.
- **AC-7** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm knip` verts.

## 5. Slices

1. Créer `application/comment/ports/comment-view.ts` et `comment-query.port.ts`.
2. Amputer le port de domaine de sa moitié lecture.
3. Adapter `prisma-comment.repository.ts`.
4. Écrire `interface/article/comment.mapper.ts` et son test.
5. Basculer les 3 use cases, le controller, le module.

## 6. Hors-scope

- Ajouter la pagination des commentaires, que le contrat ne prévoit pas.
- Fusionner les deux `findById` : ils répondent à deux questions différentes.
- L'édition de commentaire, absente du contrat RealWorld.
