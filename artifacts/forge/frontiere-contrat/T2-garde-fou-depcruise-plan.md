---
ref: T2
titre: Garder la frontière du contrat avec dependency-cruiser (warn)
tier: F-lite
vague: 0
depend_de: [T1]
statut: planifie
---

# T2 — Le garde-fou qui manquait, et la règle écrite

## 1. Problème

`pnpm depcruise` sort vert : `no dependency violations found (109 modules, 471 dependencies
cruised)`. Pendant ce temps, 8 des 17 fichiers de `domain/` importent le contrat HTTP.

La règle `domain-stays-pure` de `.dependency-cruiser.cjs` interdit deux choses : les couches
externes (`^src/(application|infrastructure|interface)/`) et les frameworks
(`@nestjs`, `@prisma`, `prisma`, `rxjs`, `express`). `@repo/shared` n'y figure pas. La seule
frontière réellement franchie du dépôt est la seule qui n'est pas gardée.

Deux trous secondaires du même outil :

- Le script est `cd apps/api && depcruise src`. **`apps/web` et `packages/shared` ne sont jamais
  analysés.**
- Aucune règle projet écrite. `conduit-fullstack` n'a pas d'équivalent du
  `12-backend-hexagonal.md` de crmcoaching. La convention hexagonale n'existe qu'éparpillée dans
  31 ADR et dans des commentaires d'en-tête, ce qui explique qu'elle ait été arbitrée fichier par
  fichier.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `.dependency-cruiser.cjs` | ajouter 2 règles `warn` avec sites legacy nommés |
| `docs/architecture/frontieres-hexagonales.md` | créer la règle projet versionnée |
| `CONTRIBUTING.md` | renvoyer vers la règle depuis la section qualité |

`.claude/` est gitignoré dans ce dépôt (`.gitignore:55`). La règle projet ne peut donc pas y
vivre : elle irait dans un fichier non commité, invisible en revue et absente du dépôt public.
Elle va dans `docs/architecture/`, à côté de `diagrams.md`.

## 3. Décisions

**Deux règles, en `warn` et non en `error`.** C'est le patron emprunté à crmcoaching, dont la
config nomme ses 5 violations legacy par chemin exact avec le commentaire « à fixer dans un PR
dédié, ne pas en faire un précédent ». Un `warn` honnête vaut mieux qu'un `error` qui ne regarde
pas au bon endroit : il chiffre la dette à chaque exécution et la fait descendre visiblement.

```js
{
  name: 'domain-owns-its-model',
  severity: 'warn', // -> 'error' en T8
  from: { path: '^src/domain/' },
  to: { path: '@repo/shared' },
},
{
  name: 'application-owns-its-io',
  severity: 'warn', // -> 'error' en T8
  from: { path: '^src/application/' },
  to: { path: '@repo/shared' },
},
```

**Pourquoi deux règles et non une.** Elles ne disent pas la même chose. La première protège un
modèle métier ; la seconde protège la signature d'un use case. Elles seront violées et corrigées
par des lots différents, et leurs compteurs doivent descendre séparément.

**Ce que T2 ne fait pas :** étendre l'analyse à `apps/web` et `packages/shared`. Ce serait
mélanger deux sujets dans un commit, et l'extension a besoin de la bascule `error` pour avoir un
sens. Elle va en T8.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `pnpm depcruise` sort en **0** (les règles sont en `warn`, elles ne bloquent pas) et
  imprime les violations.
- **AC-2** : la sortie nomme **8 modules** sous `domain-owns-its-model` : les 4 `*.errors.ts`
  (`domain/shared/errors/domain.error.ts`, `article.errors.ts`, `comment.errors.ts`,
  `user.errors.ts`), les 3 ports (`article-query.port.ts`, `comment-repository.port.ts`,
  `tag-query.port.ts`) et `domain/user/user.ts`.
- **AC-3** : la sortie nomme **18 modules** sous `application-owns-its-io`.

  > **Correction du 2026-08-21, à l'implémentation.** L'AC annonçait 17, chiffre tiré d'un `grep`
  > sur les imports de sources. La règle en compte 18 : `get-current-user.use-case.spec.ts` est
  > lui aussi un module de `application/` qui importe le contrat. Les specs ne sont pas exclues de
  > l'analyse dans ce dépôt, contrairement au réglage de crmcoaching. C'est le bon comportement et
  > il est conservé : une spec qui importe le contrat dans `application/` porte exactement le même
  > couplage que la source.
- **AC-4** : le commentaire de chaque règle cite l'ADR 031 et le lien vers
  `docs/architecture/frontieres-hexagonales.md`.
- **AC-5** : `docs/architecture/frontieres-hexagonales.md` énonce la règle de placement des ports
  décidée en T1 (« un port vit là où vit ce qu'il protège ») et la liste des consommateurs
  autorisés de `@repo/shared`.
- **AC-6** : le hook pre-push (`lefthook.yml`, tâche `depcruise`) reste vert.

## 5. Slices

1. Ajouter les deux règles dans `.dependency-cruiser.cjs`, exécuter, relever les compteurs.
2. Écrire `docs/architecture/frontieres-hexagonales.md`.
3. Ajouter le renvoi dans `CONTRIBUTING.md`.

## 6. Hors-scope

- Corriger la moindre violation. T2 les rend visibles, il n'en résout aucune.
- L'extension à `apps/web` et `packages/shared` (T8).
- La bascule `warn` vers `error` (T8).
