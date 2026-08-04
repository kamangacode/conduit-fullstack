---
paths:
  - "apps/api/**"
---

# Backend : Hexagonal, DDD, Clean Architecture

L'architecture de `apps/api` combine trois cadres qui se recouvrent : **hexagonal** (Ports et Adapters, Cockburn), **Clean Architecture** (Dependency Rule, Martin) et **DDD** (building blocks tactiques, Evans/Vernon). Le port est à la fois la boundary de Clean, l'abstraction du Dependency Inversion Principle, et le contrat que l'infrastructure implémente.

## Les 4 couches et la règle de dépendance

Les dépendances pointent **toujours vers l'intérieur**. Le coeur ne connaît rien de l'extérieur.

1. **`domain/`** : TypeScript pur. Entities, Value Objects, Ports, Domain Events, erreurs métier. **0 import** de Prisma, NestJS, ou tout package technique.
2. **`application/`** : Use Cases. Dépend uniquement d'interfaces (Ports) du domaine. **Ne jamais importer depuis `interface/`** : l'input du Use Case est défini localement (pattern use-case-owned input).
3. **`infrastructure/`** : Adapters (Prisma, services externes). Implémentent toujours un Port du domaine.
4. **`interface/`** : Controllers NestJS. Valident (Zod), mappent explicitement le payload et l'utilisateur authentifié vers l'input du Use Case, délèguent. Aucune logique métier.

**Avant de créer une classe** : dans quelle couche appartient-elle ? Domain qui importe Prisma = erreur d'architecture. Use Case qui importe depuis `interface/` = violation.

## Modules domaine

```
apps/api/src/domain/
├── user/       # Entité User, ports (register, login, update profile)
├── article/    # Entité Article, ports (CRUD, feed, slugify, Favorite)
├── comment/    # Entité Comment, ports (CRUD sur un article)
├── profile/    # Profile (vue publique d'un User), Follow/unfollow
├── tag/        # Tag, ports (liste des tags globaux)
└── shared/     # Erreurs domaine partagées, value objects communs
```

Le domaine `article` porte aussi les favoris (`Favorite`) et le domaine `profile` le suivi (`Follow`), tels que définis par la spec RealWorld.

## Dependency Rule et Dependency Inversion

La règle n'est pas qu'un document : le **Port** (interface + token DI) vit dans `domain/`, l'**Adapter** l'implémente dans `infrastructure/`. Exemple : `domain/article/article-repository.port.ts` ne connaît jamais un type Prisma (`Prisma.ArticleGetPayload<...>`), il manipule une projection maison (`Article`, entité domaine).

Si le repo se dote un jour d'un outil de vérification automatique de cette règle (ex : dependency-cruiser), documenter le choix en ADR et le brancher en CI/pre-push. En attendant, c'est une revue manuelle à chaque PR touchant `domain/` ou `application/`.

## DDD tactique : building blocks

### Value Object
Immuable, validé au constructeur, identité par valeur.
- Exemple : `domain/article/value-objects/slug.ts` (constructeur privé + factory statique `fromTitle`/`parse` + validation + `equals()`), `domain/user/value-objects/email.ts`.
- Pas de super-classe : les VO sont des classes standalone.

### Aggregate Root
Frontière de cohérence, seul point d'entrée, protège ses invariants.
- Constructeur privé + factory statique + méthodes métier qui retournent une nouvelle instance **ou** throw une `DomainError`.
- Exemple : `domain/article/article.ts` (immuable, `favorite`/`unfavorite`/`addTag` retournent un nouvel `Article`), `domain/comment/comment.ts`.
- Pour toute création/reconstitution, préférer une factory nommée `fromProps` (création tolérante depuis la persistance) et documenter toute divergence.

### Domain Event
- Classe PascalCase au passé + interface de props, champs `readonly`. Exemple : `domain/article/events/article-favorited.event.ts`, `domain/profile/events/user-followed.event.ts`.
- Écritures cross-contexte via événements, **pas** par import direct entre contextes (ex : mettre à jour `favoritesCount` sur `Article` en réaction à `ArticleFavorited`, plutôt que faire écrire `profile/` directement dans `article/`).

### Domain Error
- `domain/shared/errors/domain.error.ts` : `abstract class DomainError extends Error` avec `abstract readonly errorCode`.
- Le mapping `errorCode` -> code HTTP est **owned par l'infrastructure** (`infrastructure/filters/domain-exception.filter.ts`, `@Catch(DomainError)`). Le domaine reste pur.

### Repository, Factory
- Repository = Port (interface dans `domain/`) + adapter Prisma dans `infrastructure/`.
- Factory : distinguer création (valide tous les invariants, ex : générer un `slug` unique à la création d'un `Article`) et reconstitution (tolérante, depuis la persistance).

## DDD stratégique

- **Bounded Context** = un sous-dossier de `domain/` (`user`, `article`, `comment`, `profile`, `tag`), avec sa responsabilité métier.
- **Ubiquitous Language** : le vocabulaire du code est celui de la spec RealWorld (slug, favorite, follow, feed, tagList). Un seul vocabulaire, du domaine à l'UI.
- **Context Mapping** : `article` expose `Favorite` sans dupliquer l'entité `User` (référence par id) ; `profile` expose `Follow` en Customer/Supplier léger sur `user`. **Shared Kernel** via `packages/shared` : les DTOs/schémas Zod sont la source de vérité unique, consommée par `api` et `web` sans redéfinition.

## Garde-fou de couture DI (le patron de bug le plus fréquent)

La plupart des bugs backend partagent le même patron : un comportement câblé sur un chemin, absent de son frère. Le câblage DI cross-module est la couture la plus fragile.

### Anti-pattern `@Optional()` + `Class | null`
Une dépendance de production n'est **jamais** `@Optional()`. L'union `Class | null` n'a pas de classe sérialisable : `emitDecoratorMetadata` émet le token `Object`, NestJS injecte `null` **en silence**.

```ts
// Mauvais : injecté null en silence si le provider n'est pas résolu
constructor(@Optional() private readonly favoriteArticle: FavoriteArticleUseCase | null) {}

// Bon : @Inject(Class) explicite obligatoire pour toute dep de classe cross-module
constructor(@Inject(FavoriteArticleUseCase) private readonly favoriteArticle: FavoriteArticleUseCase) {}
```

### Boot-smoke DI
Un test dédié (ex : `apps/api/src/app-module.boot.spec.ts`) compile le **vrai** graphe NestJS DB-free (`.compile()` avec `PrismaService` stubbé, secrets bare-env posés avant les imports). C'est le seul niveau de test qui voit le graphe de prod : il asserte chaque collaborateur cross-module **non-null** (`toBeInstanceOf` seul passerait avec une dep null), et prouve le fail-at-boot (un module amputé d'un use-case doit faire rejeter `.compile()`).

**Quand tu ajoutes un use-case avec un `@Inject` cross-module** : couvre-le dans le boot-smoke (voir [16-tests-coverage.md](16-tests-coverage.md)).

## Prisma : workflow obligatoire

Toute modification de `schema.prisma` (modèle, colonne, relation, index) **DOIT** produire un fichier de migration.

```bash
# 1. Modifier schema.prisma
# 2. Créer la migration (obligatoire)
npx prisma migrate dev --name <slug_descriptif>
# 3. Vérifier migrations/<timestamp>_<slug>/migration.sql
# 4. Committer le migration.sql AVEC le schema.prisma
```

`generate` (met à jour le client TS, ne touche pas la DB) `!=` `migrate dev` (crée + applique le SQL). **Checklist PR** : si `schema.prisma` est dans le diff, un fichier `migrations/` correspondant DOIT l'être aussi.

## Auth — côté backend

L'authentification suit la spec RealWorld : JWT signé par `apps/api`, vérifié par un guard NestJS sur les routes protégées. Pas de couche hexagonale dédiée pour l'auth elle-même (mécanisme transverse d'infrastructure), mais l'entité `User` du domaine reste pure — la vérification du JWT vit dans `infrastructure/`, jamais dans `domain/`.

## Logging

Utiliser un logger structuré plutôt que des `console.log` directs. **Jamais de secret ni de donnée personnelle (email, mot de passe, token) en clair dans un message de log.**
