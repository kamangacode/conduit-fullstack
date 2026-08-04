---
paths:
  - ".github/**"
  - "vercel.json"
  - "docker-compose.yml"
  - "Dockerfile*"
  - "lefthook.yml"
---

# Déploiement & CI/CD

## Déploiement

| App | Hébergement |
|-----|-------------|
| `apps/web` | Vercel |
| `apps/api` | Railway |
| DB | PostgreSQL (Railway) |

## CI/CD

| Workflow | Déclencheur | Actions |
|----------|------------|---------|
| `ci.yml` | PR → main/staging · push sur main/staging | detect-changes → lint → typecheck → test → build → e2e |
| `pr-title.yml` | PR | Validation titre Conventional Commits |
| `auto-merge.yml` | label `reviewed` + CI verte | merge automatique de la PR |
| `release-please.yml` (ou équivalent) | push sur `main` | dérive le semver + le changelog + le tag depuis les commits conventionnels de `main` |

Déploiement déclenché sur CI verte (`apps/web` → Vercel, `apps/api` → Railway). `main` n'est jamais alimenté directement : le flux est `staging → main` via une **promotion** explicite (voir `02-workflow-dev.md`), jamais de push direct sur `main`.

### Promotion staging → main : merge commit obligatoire, jamais squash

Si `auto-merge.yml` squashe toute PR portant le label `reviewed`, la PR de promotion `staging → main` ne doit **pas** recevoir ce label : squasher une promotion aplatit les N commits conventionnels de `staging` en un seul commit, et un outil de release qui dérive le semver depuis les commits sur `main` (`release-please.yml` ou équivalent) **saute la release** — pas de version bump, `main` diverge silencieusement de l'historique conventionnel. La PR de promotion doit toujours être mergée en **merge commit**. Fix d'un squash raté : ré-ouvrir la PR `staging → main` et la merger en merge commit (no-op côté contenu, restaure l'historique).

### Gate E2E

Le job E2E est coûteux (Postgres réel, build complet) : on peut le garder derrière un gate qui évite de le relancer inutilement sur un arbre git inchangé (ex : hash du contenu pertinent + cache de résultat). À affiner selon la volumétrie réelle des changements — documenter la stratégie retenue dans un ADR si elle devient non triviale.

Git hooks via **Lefthook** (`lefthook.yml`) : vérifications rapides avant commit/push (lint, `.env` non commité).

## Environnement local (Docker)

- `docker-compose.yml` : PostgreSQL dev, Adminer (admin DB), Mailpit (capture des emails sortants en dev/test)
- `Dockerfile.dev` : image de développement containerisé

### DB de test E2E isolée

Pour ne jamais polluer la DB de dev, les tests E2E locaux utilisent un conteneur Postgres dédié (profile Docker `test`, stockage éphémère). Stratégie alignée sur la CI (service Postgres dédié, base jetable).

- `pnpm test:e2e` = démarre la DB de test → Playwright → purge (TRUNCATE, schéma/migrations conservés) même en cas d'échec.
- Garde-fou : si un serveur dev occupe déjà le port de l'app, Playwright pourrait le réutiliser (branché sur la DB de dev) et contourner l'isolation — vérifier qu'aucun serveur dev ne tourne avant de lancer `test:e2e` en local.

### Tests d'intégration (`*.integration.spec.ts`) sur la même DB de test

Les tests d'intégration Vitest (vraie PostgreSQL via Prisma) partagent l'isolation de la DB de test, sur le même principe que le E2E. Sans ça, Vitest chargerait le `.env` de dev et les specs pollueraient la base de dev.

- Lane séparée de l'unit : la config Vitest de `apps/api` exclut `**/*.integration.spec.ts`. La lane unit (`pnpm test`) reste DB-free et rapide.
- `pnpm test:integration` = démarre la DB de test → migrate deploy + seed → Vitest → purge même en échec.
