# ADR 001 — Topologie monorepo et partage du modèle

## Status

Accepted — 2026-08-04.

## Context

Conduit est ici implémenté en full-stack TypeScript (une API et un front), là où les
autres implémentations de référence séparent une spine Java et un front distinct.

Le problème central de toute app front/back est la **cohérence du modèle** : les formes
métier (Article, Comment, Profile, User), les DTOs et les règles de validation doivent
rester identiques des deux côtés. Une divergence silencieuse entre ce que l'API renvoie
et ce que le front attend est une classe de bugs entière — détectée tard, au runtime.

L'implémentation Java résout ce couplage par un **contrat externe** (OpenAPI) : le back
l'expose, le front le consomme, et le contrat doit rester synchronisé des deux côtés.
Nous voulions explorer l'autre chemin et le rendre démontrable.

## Options Considered

| Option | Mécanisme | Trade-off |
|---|---|---|
| **Package partagé (retenue)** | `web` et `api` importent types/DTOs/schémas depuis `packages/shared` | Simple, zéro génération ; demande la discipline de tout faire transiter par `shared` |
| Contrat externe (OpenAPI) | Le back publie un schéma, le front génère un client | Automatique mais réintroduit une étape de génération (le modèle de la spine Java) |
| RPC typé (tRPC) | Le type de l'API traverse l'appel | Très ergonomique mais couple `web` et `api` au runtime |
| Deux dépôts séparés | Modèle dupliqué et maintenu à la main de chaque côté | Aucune garantie de cohérence : la dérive est inévitable |

Côté outillage du dépôt unique : **Turborepo + pnpm workspaces** (cache de tâches,
orchestration `build`/`lint`/`typecheck`/`test`, filtrage par workspace) contre un
monorepo « à la main » (scripts npm imbriqués) ou Nx (plus riche mais plus lourd à cadrer
pour un dépôt vitrine).

## Decision

Monorepo **Turborepo + pnpm workspaces** avec trois workspaces :

- `packages/shared` — **source de vérité unique** du modèle Conduit (types, DTOs, enums,
  schémas Zod). Ne dépend d'aucun framework.
- `apps/api` — NestJS hexagonal, dépend de `shared`.
- `apps/web` — Next.js App Router, dépend de `shared`, parle à l'API par HTTP typé.

La cohérence front/back n'est plus un contrat à maintenir : c'est une **dépendance de
compilation**. Si le modèle change dans `shared`, ce qui ne suit pas ne compile plus,
front comme back. Le compilateur TypeScript est le contrat.

## Consequences

### Positive
- Une règle de modèle = une définition. Impossible de faire diverger silencieusement le front et le back.
- Zéro étape de génération de client ; le refactoring traverse les trois workspaces d'un coup, guidé par le typecheck.
- Cache Turbo : les tâches non impactées ne re-tournent pas.

### Negative
- Discipline requise : tout type Conduit doit vivre dans `shared`, jamais redéfini dans `api` ou `web` (garde-fou de frontière hexagonale à outiller — dependency-cruiser, Phase 1).
- Couplage de version entre `api` et `web` : ils avancent ensemble dans le même dépôt (acceptable ici — un seul front, un seul service).

### Neutral
- `web` ne dépend jamais de `api` au niveau du code : il type ses réponses via `shared` mais parle à l'API par HTTP.
- Le partage par package suppose que `shared` soit buildé avant ses consommateurs — orchestré par la dépendance de tâches Turbo (`^build`).
