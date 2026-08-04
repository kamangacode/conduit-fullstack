---
paths:
  - "apps/api/**"
---

# Backend — Architecture Hexagonale

L'architecture hexagonale (Ports & Adapters) s'applique **exclusivement à `apps/api`**. Les agents DOIVENT respecter ces règles dans `apps/api/src/` :

1. **`domain/`** — 0 import de Prisma, NestJS, ou tout package technique. TypeScript pur.
2. **`application/`** : Use Cases uniquement. Dépend uniquement d'interfaces (Ports) du Domain. **Ne jamais importer un type depuis `interface/`** : l'input du Use Case est défini localement.
3. **`infrastructure/`** — Adapters Prisma et services externes. Implémentent toujours un Port du Domain.
4. **`interface/`** : NestJS Controllers. Valident avec Zod puis délèguent au Use Case en mappant explicitement le payload Zod et l'utilisateur authentifié vers l'input du Use Case.

**Avant toute création de classe dans `apps/api`** : demande-toi dans quelle couche elle appartient. Si une classe du Domain importe Prisma → erreur d'architecture. Si un Use Case importe depuis `interface/` → violation.

## Modules domaine actuels

```
apps/api/src/domain/
├── user/       # Entité User, ports (register, login, update profile)
├── article/    # Entité Article, ports (CRUD, feed, slugify)
├── comment/    # Entité Comment, ports (CRUD sur un article)
├── profile/    # Profile (vue publique d'un User), follow/unfollow
├── tag/        # Tag, ports (liste des tags globaux)
└── shared/     # Erreurs domaine partagées, value objects communs
```

Le domaine `article` porte aussi les favoris (`Favorite`) et le domaine `profile` le suivi (`Follow`), tels que définis par la spec RealWorld.

## Prisma — workflow obligatoire

Toute modification de `schema.prisma` (nouveau modèle, nouvelle colonne, relation, index) **DOIT** produire un fichier de migration :

```bash
# 1. Modifier schema.prisma
# 2. Créer la migration (obligatoire — NE PAS sauter cette étape)
npx prisma migrate dev --name <slug_descriptif>
# 3. Vérifier que le fichier migrations/<timestamp>_<slug>/migration.sql existe
# 4. Committer le fichier migration.sql AVEC le schema.prisma modifié
```

**`prisma generate` ≠ `prisma migrate dev`** :
- `generate` met à jour le client TypeScript (le code compile) mais ne touche PAS la base de données
- `migrate dev` crée le fichier SQL de migration ET l'applique — c'est celui-ci qui est indispensable

**Checklist avant PR** : si `schema.prisma` est dans le diff, un fichier `migrations/` correspondant DOIT aussi être dans le diff. Sinon, la PR est incomplète.

## Auth — côté backend

L'authentification suit la spec RealWorld : JWT signé par `apps/api`, vérifié par un guard NestJS sur les routes protégées. Pas de couche hexagonale dédiée pour l'auth elle-même (c'est un mécanisme transverse d'infrastructure), mais l'entité `User` du domaine reste pure — la vérification du JWT vit dans `infrastructure/`, jamais dans `domain/`.

## Logging

Utiliser un logger structuré (ex : le `Logger` NestJS ou un wrapper dédié) plutôt que des `console.log` directs. **Jamais de secret ni de donnée personnelle (email, mot de passe, token) en clair dans un message de log.**
