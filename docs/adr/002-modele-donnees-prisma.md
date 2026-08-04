# ADR 002 — Modèle de données Conduit (Prisma / PostgreSQL)

## Status

Accepted — 2026-08-04. **Amendé le 2026-08-05 par [004 — Persistance alignée sur le contrat](004-persistance-alignee-sur-le-contrat.md)** sur deux points où la confrontation au contrat RealWorld a tranché contre les choix ci-dessous : `Comment.id` (entier et non UUID) et `User.bio` (nullable et non `@default("")`). Les autres décisions restent valides.

## Context

`apps/api` a besoin d'une couche de persistance pour le domaine Conduit. La forme du
modèle est contrainte par la spec RealWorld (User, Article, Comment, Tag, favoris, suivi).
Le choix porte sur l'ORM/outil d'accès et sur quelques décisions de modélisation, pas sur
la forme métier elle-même (imposée par la spec).

Ce schéma est la couche **infrastructure** de l'architecture hexagonale : les entités du
domaine (`apps/api/src/domain`) restent pures et sont reconstituées depuis ces tables par
les adapters. Le schéma de persistance et le modèle de domaine peuvent donc diverger
volontairement (ex : le domaine calcule `favoritesCount`, la base ne le stocke pas).

## Options Considered

**Outil d'accès aux données**

| Option | Trade-off |
|---|---|
| **Prisma (retenue)** | Schéma déclaratif, migrations versionnées générées, client typé, excellent DX ; runtime avec moteur natif à embarquer |
| TypeORM | Intégration NestJS historique, mais migrations et typage plus fragiles |
| Drizzle | Très léger et proche du SQL, mais écosystème migrations plus jeune |
| SQL brut + query builder | Contrôle total, mais typage et migrations entièrement à la charge du dev |

**Décisions de modélisation**

- **Identifiants** : UUID (`@db.Uuid`) plutôt qu'auto-increment — pas d'énumérabilité des
  ressources, IDs non devinables (surface anti-IDOR réduite), génération côté application possible.
  *(Amendé : `Comment.id` fait exception, cf. ADR 004 — le contrat externe le déclare entier.)*
- **Favoris / Suivi** : tables de jointure explicites (`favorites`, `follows`) à clé
  composite, plutôt que des relations implicites — la clé composite interdit le doublon au
  niveau base (un utilisateur ne peut favoriser deux fois le même article).
- **Compteurs** (`favoritesCount`) : **dérivés** de la table de jointure à la lecture, non
  dénormalisés — pas d'incohérence possible entre le compteur et les faits. La
  dénormalisation reste une optimisation ouverte si le profilage la justifie.
- **Tags** : relation many-to-many implicite Article↔Tag (table de jointure gérée par Prisma).

## Decision

**Prisma + PostgreSQL**. Schéma initial : `users`, `articles`, `comments`, `tags`,
`favorites`, `follows` + jointure implicite `_ArticleTags`. UUID partout, `@@map` en
snake_case pluriel, cascades `onDelete: Cascade` sur les relations possédées.

Toute modification de `schema.prisma` produit une **migration versionnée committée**
(garde-fou : `.claude/rules/12-backend-hexagonal.md`). Migration initiale :
`20260804200154_init`.

## Consequences

### Positive
- Migrations reproductibles et auditables (SQL committé, revu en PR).
- Client Prisma typé : les adapters d'infrastructure ne manipulent jamais de `any`.
- Contraintes d'intégrité au bon niveau (unicité email/username, clés composites favoris/suivi, cascades).

### Negative
- Le domaine ne doit jamais importer un type Prisma (`Prisma.ArticleGetPayload<…>`) : les
  adapters projettent vers les entités du domaine. C'est une discipline à tenir (revue + futur test d'architecture).
- Le moteur de requête Prisma est un binaire natif à embarquer au déploiement (image Docker de l'API).

### Neutral
- Le chiffrement PII at-rest de l'email (AES-256-GCM + blind index HMAC) est un durcissement
  distinct, prévu en Phase 5 (item B5) ; il ne change pas la forme des tables ici.
- Le port Postgres de développement par défaut est 5432 (voir `docker-compose.yml`) ;
  seule l'URL `DATABASE_URL` est injectée dans le schéma, jamais un port en dur.
