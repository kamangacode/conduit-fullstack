# Diagrammes d'architecture (as code)

> Diagrammes versionnés en **mermaid** : ils vivent dans le dépôt, se relisent en revue
> comme du code, et se mettent à jour dans la même PR que le changement qu'ils décrivent.
> GitHub les rend nativement.

## Topologie du monorepo

Le modèle Conduit est écrit **une seule fois** dans `packages/shared` et importé des deux
côtés : la cohérence front/back est une dépendance de compilation, pas un contrat à
maintenir en double (voir [ADR 001](../adr/001-topologie-monorepo-modele-partage.md)).

```mermaid
flowchart LR
  web["apps/web<br/>(Next.js)"] -- REST --> api["apps/api<br/>(NestJS, hexagonal)"]
  api -- Prisma --> db[("PostgreSQL")]
  web -- importe --> shared["packages/shared<br/>(types + DTOs + Zod)"]
  api -- importe --> shared
```

## Couches de l'API (architecture hexagonale)

Le `domain` est pur : aucun import de NestJS ni de Prisma. Les dépendances pointent
toujours **vers l'intérieur** ; la frontière est vérifiée mécaniquement par
`dependency-cruiser`.

```mermaid
flowchart TB
  subgraph interface["interface (NestJS)"]
    ctrl["Controllers · DTOs · Guards"]
  end
  subgraph application["application"]
    uc["Use cases"]
  end
  subgraph domain["domain (TS pur)"]
    ent["Entities · Value Objects"]
    ports["Ports (interfaces)"]
  end
  subgraph infrastructure["infrastructure"]
    adapters["Adapters Prisma · argon2id · jose"]
  end

  ctrl --> uc
  uc --> ports
  uc --> ent
  adapters -. implémente .-> ports
```

## Modèle de données (ERD)

Reflète [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma)
([ADR 002](../adr/002-modele-donnees-prisma.md)). `Comment.id` est le seul identifiant
entier du modèle, par alignement sur le contrat officiel ([ADR 004](../adr/004-persistance-alignee-sur-le-contrat.md)).

```mermaid
erDiagram
  USER ||--o{ ARTICLE   : "écrit"
  USER ||--o{ COMMENT   : "écrit"
  USER ||--o{ FAVORITE  : "marque"
  USER ||--o{ FOLLOW    : "suit / est suivi"
  ARTICLE ||--o{ COMMENT  : "porte"
  ARTICLE ||--o{ FAVORITE : "est favori de"
  ARTICLE }o--o{ TAG      : "étiqueté"

  USER {
    uuid id PK
    string email UK
    string username UK
    string passwordHash
    string bio "nullable"
    string image "nullable"
  }
  ARTICLE {
    uuid id PK
    string slug UK
    string title
    uuid authorId FK
  }
  COMMENT {
    int id PK
    string body
    uuid articleId FK
    uuid authorId FK
  }
  TAG {
    uuid id PK
    string name UK
  }
  FAVORITE {
    uuid userId PK "FK users"
    uuid articleId PK "FK articles"
  }
  FOLLOW {
    uuid followerId PK "FK users"
    uuid followingId PK "FK users"
  }
```

## Flux d'authentification

Inscription/connexion : hachage **argon2id**, émission d'un JWT signé (`jose`) porté
ensuite par l'en-tête `Authorization: Token <jwt>` ([ADR 007](../adr/007-authentification-argon2id-jose.md)).

```mermaid
sequenceDiagram
  participant C as Client (web)
  participant A as API (interface)
  participant UC as Use case (application)
  participant H as Hasher argon2id
  participant DB as PostgreSQL

  C->>A: POST /api/users (register)
  A->>A: Validation Zod (422 si invalide)
  A->>UC: RegisterUser
  UC->>H: hash(password)
  UC->>DB: INSERT user (409 si email/username pris)
  UC-->>A: user + JWT signé
  A-->>C: 201 { user, token }

  C->>A: GET /api/user (Authorization: Token <jwt>)
  A->>A: AuthGuard vérifie la signature
  A-->>C: 200 (ou 401 si jeton absent/invalide)
```

## Références

- [ADR 001 — topologie monorepo](../adr/001-topologie-monorepo-modele-partage.md)
- [ADR 002 — modèle de données](../adr/002-modele-donnees-prisma.md)
- [ADR 007 — authentification argon2id / jose](../adr/007-authentification-argon2id-jose.md)
- Syntaxe : <https://mermaid.js.org>
