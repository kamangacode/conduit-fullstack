---
ref: T7
titre: tag — descendre TagQueryPort en application
tier: S
vague: 2
depend_de: [T3]
statut: planifie
---

# T7 — Le plus petit lot, et le plus démonstratif

## 1. Problème

`domain/tag/ports/tag-query.port.ts` importe `Tag` depuis `@repo/shared` pour déclarer
`listUsed(): Promise<readonly Tag[]>`.

Or `Tag` vaut `z.infer<typeof z.string().trim().min(1)>`, c'est-à-dire **`string`**. Le domaine
importe donc le contrat HTTP pour obtenir le type `string`.

C'est le cas le plus révélateur du lot, parce qu'il ne peut pas se défendre par la performance ni
par la cohérence de forme, contrairement à `ArticleQueryPort`. Il ne reste que l'habitude : le
type venait de `shared`, donc on l'a importé de `shared`.

Le contexte `tag` n'a par ailleurs aucun agrégat, aucun invariant, aucune entité : `domain/tag/`
ne contient que ce port. Un dossier de domaine dont le seul contenu est un port de lecture n'est
pas un contexte borné, c'est un cas d'usage.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `application/tag/ports/tag-query.port.ts` | créé, déplacé depuis `domain/tag/ports/` |
| `domain/tag/` | supprimé (dossier vide après le déplacement) |
| `application/tag/list-tags.use-case.ts` | sortie en `readonly TagName[]` |
| `infrastructure/persistence/prisma-tag.query.ts` | import du port mis à jour |
| `interface/tag/tag.controller.ts` | fabrique l'enveloppe `{ tags }` |
| `interface/tag/tag.module.ts` | jeton `TAG_QUERY` déplacé |

## 3. Décisions

**Le type devient `TagName`, un alias possédé par le dépôt.**

```ts
export type TagName = string
```

Un alias de `string` n'ajoute aucune sécurité de type, et ce n'est pas son objet : il nomme ce que
la valeur est dans le vocabulaire du dépôt, et il coupe l'import. Le jour où un tag deviendrait
un value object validé, le changement se ferait à un seul endroit.

**Pas de mapper dédié.** L'enveloppe `{ tags: [...] }` est produite directement dans le
controller. Écrire un fichier `tag.mapper.ts` pour une clé et un tableau serait de la cérémonie :
le mapper existe en T4, T5 et T6 parce qu'il porte une conversion réelle (dates, champs,
projections). Ici il n'y a rien à convertir.

**`domain/tag/` disparaît.** Le dossier ne contenait que le port. Le supprimer plutôt que de le
laisser vide est ce qui rend le lot lisible : le contexte `tag` n'existait pas, il existait un cas
d'usage « lister les tags utilisés ». La règle `no-orphans` de depcruise confirmera qu'aucun
module ne reste sans importeur.

**La règle métier de `listUsed` ne bouge pas.** Le nom porte la règle (`listUsed`, pas `listAll`)
et l'adapter la met en oeuvre par `where: { articles: { some: {} } }`. Le commentaire qui
l'explique descend avec le port.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `apps/api/src/domain/tag/` n'existe plus.
- **AC-2** : `apps/api/src/application/tag/` ne contient aucun import de `@repo/shared`.
- **AC-3** : `GET /api/tags` renvoie la même forme. `pnpm conformance` vert.
- **AC-4** : tout tag renvoyé ramène au moins un article (REQ-TAG-002 AC-4). Le test d'intégration
  existant reste vert sans modification.
- **AC-5** : `pnpm depcruise` ne signale aucun orphelin nouveau.
- **AC-6** : le compteur `domain-owns-its-model` tombe à **0**, `application-owns-its-io` à **0**.
- **AC-7** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm knip` verts.

## 5. Slices

1. Déplacer le port, introduire `TagName`, supprimer `domain/tag/`.
2. Adapter l'adapter Prisma, le use case, le module.
3. Déplacer la fabrication de l'enveloppe dans le controller.

## 6. Hors-scope

- Faire de `TagName` un value object validé.
- Ajouter un tri par popularité, que le contrat ne prévoit pas et que les autres implémentations
  Conduit ne partagent pas.
