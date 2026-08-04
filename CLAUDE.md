# CLAUDE.md — conduit-fullstack

> Implémentation **full-stack TypeScript** de l'app **Conduit** (spec RealWorld) : monorepo `api` + `web` + `shared`.
> Repo public vitrine — chaque garde-fou craft qu'il applique devient un article de blog.

## TL;DR
- Point d'entrée : `/dev #N` pour toute nouvelle fonctionnalité ou bug
- Créer un git worktree isolé par issue avant d'implémenter
- Utiliser `AskUserQuestion` pour toute décision non triviale
- **Attribution 100 % `kamangacode`** — aucune référence à un assistant IA (voir `.claude/rules/03-commits-review.md`)

---

## Identité & attribution (règle absolue)

Ce repo est **public** et sert de **preuve de craft**. Tous les commits, titres de PR, corps de PR et docs sont attribués à `kamangacode <herve021@gmail.com>`.

**Interdiction absolue** de toute mention d'un assistant IA (Claude, Claude Code, « Generated with… », `Co-Authored-By: Claude`, etc.) où que ce soit dans l'historique ou les artefacts du repo. Détail dans `.claude/rules/03-commits-review.md`.

---

## Commandes

```bash
pnpm dev                            # Démarre api + web en parallèle (Turborepo)
pnpm build                          # Build toutes les apps
pnpm lint                           # Lint (Biome)
pnpm typecheck                      # TypeScript typecheck
pnpm test                           # Tests unitaires (Vitest) — DB-free, rapide
pnpm test:integration               # Tests d'intégration (DB de test isolée)
pnpm test:e2e                       # Tests E2E (Playwright, DB de test isolée)
pnpm --filter @repo/api exec prisma migrate dev   # Migrations DB
pnpm --filter @repo/shared build                  # Rebuild des DTOs/types partagés
```

---

## Architecture

**Stack** : Monorepo Turborepo · pnpm workspaces · TypeScript strict.

| App | Stack | Rôle |
|-----|-------|------|
| `apps/api` | NestJS · Prisma · PostgreSQL · Zod · Vitest | Backend — domaine Conduit, API REST hexagonale |
| `apps/web` | Next.js (App Router) · React · TanStack Query | Frontend — UI RealWorld, appels REST vers `apps/api` |
| `packages/shared` | TypeScript pur + Zod | **Source de vérité unique** : types, DTOs, enums Conduit + schémas de validation |

**Angle craft central** : le modèle Conduit est **écrit une seule fois** dans `packages/shared`. Ni `api` ni `web` ne redéfinit un type — un changement de modèle casse la compilation des deux côtés avant le runtime. C'est le contraste avec une spine Java + front séparé (contrat maintenu en double).

### Structure des dossiers

```
conduit-fullstack/
├── apps/
│   ├── api/src/
│   │   ├── domain/          # Hexagonal : Entities, Value Objects, Ports (TS pur)
│   │   ├── application/     # Hexagonal : Use Cases
│   │   ├── infrastructure/  # Hexagonal : Adapters Prisma, services externes
│   │   └── interface/       # NestJS Controllers, DTOs
│   └── web/src/
│       ├── app/             # Next.js App Router (pages)
│       ├── components/      # Composants React
│       └── lib/             # api-client.ts
├── packages/
│   └── shared/              # types, DTOs, enums Conduit + schémas Zod
├── docs/adr/                # Architecture Decision Records
├── artifacts/               # Mémoire de session IA (frames, specs, plans)
└── .claude/rules/           # Règles de dev modulaires
```

---

## Règles modulaires

Les règles se chargent selon le contexte (`.claude/rules/`) :

| Fichier | Scope | Contenu |
|---------|-------|---------|
| `00-memoire.md` | Toujours | Mémoire persistante inter-sessions |
| `01-gestion-taches.md` | Toujours | Processus plan → implémentation |
| `02-workflow-dev.md` | Toujours | Tiers S/F-lite/F-full, worktrees, base branch `staging` |
| `03-commits-review.md` | Toujours | Conventional Commits **sans mention IA**, ADRs, review |
| `10-frontend.md` | `apps/web/**` | Séparation frontend/backend |
| `11-design-realworld.md` | `**/*.tsx`, `**/*.css` | Markup & CSS conformes à la spec RealWorld |
| `12-backend-hexagonal.md` | `apps/api/**` | Architecture hexagonale |
| `13-tests-e2e.md` | `**/*.spec.ts`, `**/*.test.ts` | Playwright + Page Object Model |
| `14-documentation.md` | `docs/**`, `**/*.md` | Documentation as code |
| `15-deploiement-cicd.md` | `.github/**`, `Dockerfile*` | Déploiement Railway/Vercel + CI/CD |
| `16-tests-coverage.md` | `apps/**/*.ts(x)`, `packages/shared/**` | Tests obligatoires par couche |
| `17-qualite-code.md` | `apps/**/src/**` | Verrou qualité (complexité, type safety) |
| `18-tracabilite-articles.md` | Toujours | 1 outil = 1 fichier réel = 1 article |

---

## Référence produit / éditorial

Ce repo est le **pivot** de la roadmap éditoriale outillage-craft (blog kamanga.fr). Chaque outil/config qu'il porte débloque un article qui pointe vers le fichier réel du repo. Voir `.claude/rules/18-tracabilite-articles.md`.
