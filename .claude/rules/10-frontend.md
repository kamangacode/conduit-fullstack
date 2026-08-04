---
paths:
  - "apps/web/**"
---

# Frontend — Séparation & Auth

## Règle fondamentale — Séparation Frontend / Backend

> **Le frontend (`apps/web`) ne parle jamais directement à la base de données.**
> Tout accès aux données passe par l'API REST de `apps/api`.

```
apps/web  ──REST──▶  apps/api  ──Prisma──▶  PostgreSQL
(Next.js)            (NestJS)
```

**`apps/web` NE FAIT PAS :**
- `import { prisma } from '...'`
- Instancier un Use Case ou un Repository
- Accès direct à la base de données sous quelque forme que ce soit
- Server Actions qui instancient un repository Prisma

**`apps/web` FAIT :**
- Tous les appels réseau via `apps/web/src/lib/api-client.ts` (endpoints RealWorld : `/articles`, `/articles/:slug/comments`, `/profiles/:username`, `/tags`, `/user`, …)
- TanStack Query pour le cache, la déduplication et le refetch
- Zustand pour l'état UI client uniquement (ex : état d'édition d'un formulaire d'article avant soumission)

## Auth côté frontend

L'authentification suit la **spec RealWorld** : JSON Web Token porté dans le header `Authorization: Token <jwt>`, stocké côté client et injecté par `api-client.ts` sur chaque requête authentifiée. Pas de session serveur, pas de cookie — le frontend est un client REST stateless vis-à-vis de l'API.

- Le token est obtenu via `POST /users/login` ou `POST /users` (inscription) et conservé côté client (ex : `localStorage`, lu au démarrage pour réhydrater l'état utilisateur).
- Les routes qui nécessitent un utilisateur connecté (édition d'article, favoris, follow) vérifient la présence du token avant d'appeler l'API ; en son absence, redirection vers la page de connexion.
- `apps/web` ne valide jamais le JWT lui-même : c'est `apps/api` qui fait autorité sur la validité du token.
