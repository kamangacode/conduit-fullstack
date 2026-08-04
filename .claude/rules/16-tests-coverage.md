---
paths:
  - "apps/api/src/**/*.ts"
  - "apps/web/src/**/*.ts"
  - "apps/web/src/**/*.tsx"
  - "packages/shared/**/*.ts"
---

# Tests : couverture par couche

## Principe

Le projet vise une couverture élevée sur le patch, répartie sur deux canaux :

- **Vitest** (unit + integration) : remonte dans le rapport de couverture.
- **Playwright** (E2E) : hors couverture par construction (parcours utilisateur, pas de mesure ligne-à-ligne).

Conséquence : les fichiers couverts uniquement par Playwright n'apparaissent pas couverts dans le rapport. Si tu touches un fichier d'une couche du tableau ci-dessous, écris le test associé **dans la même PR**.

## Tableau test-par-couche

| Tu crées ou modifies… | Test obligatoire | Où | Pourquoi |
|---|---|---|---|
| `apps/api/src/domain/**/*.ts` (entity, value object, exception) | Vitest unit, zero mock | colocalisé `*.spec.ts` | TypeScript pur, doit être ~100%. Cœur métier (règles Article/Comment/User/Favorite/Follow). |
| `apps/api/src/application/**/*.use-case.ts` | Vitest unit, ports mockés via interface | `*.use-case.spec.ts` | Coordination métier, cible ~90%. |
| `apps/api/src/infrastructure/**/*.prisma-repository.ts` | Integration (vraie DB) | `apps/api/test/**` | Adapter contre vraie DB. Pas de mock Prisma. |
| `apps/api/src/interface/**/*.controller.ts` | Integration supertest via NestJS TestingModule | `apps/api/test/**` | Valide guards, Zod, mapping vers use-case. |
| Use-case avec `@Inject` cross-module | Ligne dans le boot-smoke DI | `apps/api/src/app-module.boot.spec.ts` | Le graphe doit `.compile()` DB-free avec collaborateurs non-null. Attrape le trou de câblage DI, voir [12-backend-hexagonal.md](12-backend-hexagonal.md) section couture DI. |
| `apps/web/src/stores/**/*.ts` (Zustand) | Vitest unit | colocalisé `*.spec.ts` | État UI logique, testable sans DOM. |
| `apps/web/src/hooks/**/*.ts` | Vitest, plus `@testing-library/react` si le hook touche le DOM | colocalisé `*.spec.ts` | Hook pur ou hook DOM. |
| `apps/web/src/components/**/*.tsx` avec **logique** (état, calculs, conditionals) | Vitest + RTL | colocalisé `*.spec.tsx` | Composant fonctionnel non trivial (ex : formulaire d'article, éditeur de commentaire). |
| `apps/web/src/components/**/*.tsx` **dumb** (props in, JSX out) | Aucun test | — | Couvert par Playwright. Peu de lignes, faible impact couverture. |
| `apps/web/src/app/**/page.tsx` | E2E Playwright | `apps/web/e2e/**` | Parcours utilisateur. Ne compte pas pour la couverture mais reste obligatoire pour la confiance. |
| `packages/shared/**/*.ts` (types purs) | Aucun test | — | Types compilés, pas de runtime. |
| `packages/shared/**/*.ts` (fonctions, mappers, validateurs Zod) | Vitest unit | colocalisé `*.spec.ts` | Logique partagée entre `apps/web` et `apps/api`, doit être très couverte — c'est la source de vérité des DTOs Conduit. |

## Décision avant édition

Avant d'ajouter ou de modifier un fichier source dans une des couches ci-dessus :

1. Le fichier est-il dans une couche du tableau ? Non, ignore cette rule.
2. Existe-t-il déjà un test pour ce fichier ? Oui, ajoute-y les cas nécessaires aux changements. Non, crée-le.
3. Le test est-il du bon type pour la couche ? Si non, migre (ex : un use-case avec un test integration, bascule en unit avec ports mockés).
4. Couvres-tu les branches non-happy-path ? Erreur métier, edge cases, validation, permissions (ex : éditer un article qui n'appartient pas à l'utilisateur courant).

## Quoi NE PAS tester (gain zéro)

- DTOs (`*.dto.ts`)
- Modules NestJS (`*.module.ts`)
- `apps/api/src/main.ts`
- Migrations Prisma (`apps/api/prisma/**`)
- Fichiers de config (`*.config.ts`)
- Types purs (`*.d.ts`)
- Composants React purement présentationnels sans état.
- Re-exports (`index.ts` qui ne fait que `export * from`).

## Commandes

```bash
# Lane rapide (pre-push, boucle de dev) — sans instrumentation
pnpm test

# Couverture : mêmes tests, instrumentés, puis synthèse par workspace.
# Aucun service externe (ADR 006) — le tableau local est celui de la CI.
pnpm test:coverage
pnpm coverage:summary

# Couverture d'un seul workspace
pnpm --filter @repo/api test:coverage

# Voir les fichiers du patch
git diff --name-only origin/staging...HEAD | grep -E '\.(ts|tsx)$' | grep -v -E '\.(spec|test|dto|module|config)\.'
```

## Tests comme preuves (anti-tautologie)

Un test qui ne peut pas échouer est pire que pas de test : il donne une fausse confiance (ex : un mock qui accepte un update sans vérifier la valeur persistée).

- Heuristique : **supprime mentalement le guard ou la ligne testée**. Si le test passe encore, il est tautologique. Réécris-le pour qu'il échoue sans l'implémentation.
- C'est une **convention de revue**, pas un gate exécutable : il n'existe aucun job CI ni hook de vérification automatisé pour ça dans ce repo. Ne pas la présenter comme un contrôle automatisé.

## Avant une PR

Si tu as touché des fichiers de la couche `application` ou `infrastructure` (api) sans ajouter ou modifier de test correspondant, **pose la question via `AskUserQuestion`** avant de pousser : "Ces fichiers n'ont pas de test associé, est-ce volontaire ?".

## Patterns de fail récurrents

À compléter au fil des incidents de couverture — chaque patch sous le seuil doit laisser une trace ici (fichier, couche, cause) pour éviter la régression.
