# Qualité de code — verrou proactif

Ces règles s'appliquent à toute édition dans `apps/api/src/**/*.ts` et `apps/web/src/**/*.{ts,tsx}`. Elles complètent (et précèdent) les rules biome pour intercepter la dette avant qu'elle soit committée.

## Découpage des fonctions

- **> 50 lignes** : extraire au moins un helper avant de committer. Une fonction trop longue est un signe que plusieurs préoccupations cohabitent.
- **Cognitive complexity > 15** : bloquant. Décomposer en sous-fonctions ou extraire un service. Biome remonte ces deux signaux via `noExcessiveLinesPerFunction` et `noExcessiveCognitiveComplexity`.
- Exception tolérée : fonctions purement structurelles (mapping DTO, configuration NestJS module, switch dispatch sur des codes d'erreur HTTP). Ajouter `biome-ignore lint/complexity/<rule>: <raison invariant>` au-dessus de la déclaration concernée, jamais sans justification.

## Type safety

- **Pas de `!` non-null assertion** : utiliser un narrowing explicite (`if (x == null) throw …`) ou `?.` avec fallback. Si l'invariant est documenté (commentaire qui prouve pourquoi la valeur ne peut pas être nulle), garder le `!` et ajouter `biome-ignore lint/style/noNonNullAssertion: <invariant>`.
- **Pas de `key && key.trim()`** : utiliser `?.trim()` ou `key?.trim().length > 0` selon l'intention.
- **Éviter `as any` en production** : si une assertion de type est nécessaire, préférer une interface explicite. `as any` reste toléré dans les specs pour bypasser des private fields ou des mocks structurels, à condition d'ajouter un commentaire `// biome-ignore lint/suspicious/noExplicitAny: <raison>`.

## Helpers et extraction

Quand on extrait :

1. Garder le helper dans le même fichier d'abord ; ne sortir dans un fichier dédié que quand il est réutilisé ou quand l'extraction révèle un concept domaine.
2. Le helper porte un nom verbal qui décrit son intention (`loadArticleOrThrow`, `buildFeedQuery`), pas un nom technique (`step1`, `helper`).
3. Tests de l'helper si la logique est non triviale (branche, edge case, transformation).

## Quand bumper la rule biome de warn à error

Une rule biome reste en `warn` tant qu'elle a des occurrences legacy. Pour passer à `error` :

1. Compter les occurrences : `pnpm --filter @repo/api exec biome check ./src --reporter=github --max-diagnostics 2000 | grep '<rule>' | wc -l`.
2. Décider du seuil acceptable de `biome-ignore` à ajouter (≤ 10 = OK en un commit, > 10 = scoped follow-up issue).
3. Ajouter `biome-ignore lint/<group>/<rule>: <raison>` au-dessus de chaque occurrence legacy avec une raison précise (pas seulement "legacy").
4. Bumper la rule dans `biome.json` (passer `warn` → `error`).
5. Vérifier que `pnpm lint` ne casse plus, puis que tout nouvel ajout d'une fonction qui viole la rule fait échouer le lint.

## Référence

Suivre l'avancement de ce verrou qualité (occurrences legacy restantes, rules bumpées) via une issue de suivi dédiée dans le repo — pas de numéro figé ici, créer/rattacher au besoin.
