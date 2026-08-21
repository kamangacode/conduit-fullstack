# ADR 001 — Topologie monorepo et partage du modèle

## Status

Accepted — 2026-08-04. Amendé le 2026-08-21 par
[031 — Le contrat partagé s'arrête à la frontière HTTP](031-le-contrat-partage-s-arrete-a-la-frontiere-http.md),
qui borne la portée du partage : `packages/shared` est la source de vérité unique du **contrat
HTTP**, non du modèle métier. La décision de topologie ci-dessous n'est pas remise en cause.

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

- `packages/shared` : **source de vérité unique** du contrat Conduit (DTOs d'entrée, enveloppes de
  réponse, messages, schémas Zod). Ne dépend d'aucun framework.
- `apps/api` : NestJS hexagonal, consomme `shared` à sa frontière HTTP.
- `apps/web` : Next.js App Router, dépend de `shared`, parle à l'API par HTTP typé.

La cohérence front/back n'est plus un contrat à maintenir : c'est une **dépendance de
compilation**. Si le contrat change dans `shared`, ce qui ne suit pas ne compile plus,
front comme back. Le compilateur TypeScript est le contrat.

> **Amendement du 2026-08-21 ([ADR 031](031-le-contrat-partage-s-arrete-a-la-frontiere-http.md)).**
> Cette décision disait à l'origine « source de vérité unique du **modèle Conduit** », et les deux
> puces suivantes disaient que `api` et `web` « dépendent de `shared` », sans plus de précision.
>
> Ce mot et cette imprécision ont produit une dérive : lus comme une autorisation, ils ont conduit
> `apps/api/src/domain/` à importer le contrat HTTP dans huit de ses dix-sept fichiers. Le contenu
> réel de `packages/shared` n'a jamais été un modèle métier : ce sont des enveloppes de réponse,
> des DTOs d'entrée, des dates ISO, des champs relatifs à l'appelant HTTP, et la table
> `CONDUIT_ERROR_STATUS`. C'est un Published Language, pas un Shared Kernel.
>
> La portée est donc bornée : `shared` est consommé par `apps/web` et par
> `apps/api/src/interface/`, et **il ne franchit pas `interface/`**. Le domaine possède son modèle.
>
> La thèse ci-dessus n'est pas abandonnée, elle devient vérifiable dans les deux sens : renommer un
> champ du contrat doit casser `apps/web` et `apps/api/src/interface/`, et ne doit pas toucher
> `domain/` ni `application/`. Une thèse qui casse partout ne prouve rien.

## Consequences

### Positive
- Une règle de modèle = une définition. Impossible de faire diverger silencieusement le front et le back.
- Zéro étape de génération de client ; le refactoring traverse les trois workspaces d'un coup, guidé par le typecheck.
- Cache Turbo : les tâches non impactées ne re-tournent pas.
- **La propriété est vérifiée, pas seulement annoncée** (ajout du 2026-08-05,
  item F6) : [`scripts/verify-type-boundary.sh`](../../scripts/verify-type-boundary.sh)
  renomme un champ du contrat partagé et constate que `apps/web` **et**
  `apps/api/src/interface/` refusent tous deux de compiler, puis restaure. Lancé
  en pre-push et dans le job CI `Typecheck`, il porte l'exigence REQ-ARCH-001.
  Sans lui, la première phrase de cette section resterait une affirmation, et
  deviendrait fausse en silence le jour où quelqu'un recopierait un type au lieu
  de l'importer.
  *Amendé le 2026-08-21 (ADR 031) : le script visait `apps/api` dans son
  ensemble, ce qui revenait à exiger que le contrat traverse toutes les couches
  de l'API. Il vise désormais la seule couche qui a le droit de le connaître, et
  vérifie en plus que `domain/` et `application/` ne bougent pas.*

### Negative
- Discipline requise : tout type du contrat doit vivre dans `shared`, jamais redéfini dans `api` ou `web`. *Le garde-fou annoncé ici comme « à outiller (dependency-cruiser, Phase 1) » a bien été posé, mais à côté de la cible : la règle `domain-stays-pure` interdisait les couches externes et les frameworks, jamais `@repo/shared`. Elle sortait donc verte pendant que le domaine importait le contrat. Corrigé le 2026-08-21 par la règle `shared-stays-at-the-http-boundary` (ADR 031). La partie « aucune copie n'existe » n'est toujours pas mécanisée et reste un point de vigilance en revue.*
- Couplage de version entre `api` et `web` : ils avancent ensemble dans le même dépôt (acceptable ici — un seul front, un seul service).

### Neutral
- `web` ne dépend jamais de `api` au niveau du code : il type ses réponses via `shared` mais parle à l'API par HTTP.
- Le partage par package suppose que `shared` soit buildé avant ses consommateurs — orchestré par la dépendance de tâches Turbo (`^build`).
