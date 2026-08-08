# Cartographie des données personnelles (data-mapping)

> Cartographie champ par champ des modèles du
> [schema.prisma](../../../apps/api/prisma/schema.prisma), qui reste la source de vérité.
> Complète le [registre Art. 30](01-registre-traitements-art30.md) au niveau de la donnée.

## Légende

- **PII** : donnée à caractère personnel (directe, indirecte, ou comportementale).
- **Chiffrement V1** : ce qui est prévu at-rest en version 1 ([03](03-chiffrement-pii.md)).
- **Effacement** : comportement à l'anonymisation du compte ([05](05-droits-des-personnes.md)).

## Vue d'ensemble par modèle

| Modèle | Table | PII ? | Champs sensibles | Base légale |
|--------|-------|-------|------------------|-------------|
| `User` | `users` | Oui (cœur) | email, username, bio, image, passwordHash | 6(1)(b) |
| `Article` | `articles` | Indirecte | body/title/description (texte libre), authorId | 6(1)(b) |
| `Comment` | `comments` | Indirecte | body (texte libre), authorId | 6(1)(b) |
| `Tag` | `tags` | Non | name | 6(1)(b) |
| `Favorite` | `favorites` | Comportementale | (userId, articleId) | 6(1)(b) |
| `Follow` | `follows` | Relationnelle | (followerId, followingId) | 6(1)(b) |
| `AuditLog` (à créer) | `audit_logs` | Pseudonyme | actorRef (hash/UUID), action | 6(1)(c)/6(1)(f) |

## Détail par champ

### User (`users`) — schema.prisma:26-48

| Champ | Type | PII | Chiffrement V1 | Conservation | Effacement (anonymisation) |
|-------|------|-----|----------------|--------------|-----------------------------|
| `id` | uuid | Pseudonyme (identifiant technique) | Non | Vie du compte, conservé après anonymisation | Conservé (clé de dissociation) |
| `email` | string @unique | **PII directe** | **Oui** (AES-256-GCM + blind index) | Vie du compte | Remplacé par `anonymized-{id}@deleted.invalid` chiffré, blind index recalculé |
| `username` | string @unique | **PII** (identifiant public) | Non (public, dans les URLs) | Vie du compte | Remplacé par `deleted-user-{id}` |
| `passwordHash` | string | **Secret** (argon2id, sens unique) | N/A (haché) | Vie du compte | Réinitialisé à une valeur invalide (login impossible) |
| `bio` | string? | **PII potentielle** (texte libre) | Non en V1 (V2) | Vie du compte | Mis à `null` |
| `image` | string? | **PII potentielle** (URL avatar) | Non en V1 (V2) | Vie du compte | Mis à `null` |
| `createdAt` | datetime | Métadonnée | Non | Vie du compte | Conservé |
| `updatedAt` | datetime | Métadonnée | Non | Vie du compte | Mis à jour à l'anonymisation |
| `emailBlindIndex` (à ajouter) | string @unique | Dérivé pseudonyme (HMAC) | N/A (déjà un hash) | Vie du compte | Recalculé sur l'email anonymisé |

> **Contrainte de contrat** : `email` et `token` (JWT) sont renvoyés en clair par les réponses
> d'authentification (contrat RealWorld, `packages/shared/src/model/user.ts`). Le chiffrement est
> donc **at-rest seulement**. Atténuation : le JWT ne contient que `sub = userId` (ADR 007), aucun
> email ni username, donc un jeton intercepté ne divulgue pas de PII par lui-même.

### Article (`articles`) — schema.prisma:51-68

| Champ | Type | PII | Conservation | Effacement |
|-------|------|-----|--------------|------------|
| `id`, `slug` | uuid / string | Non (identifiants) | Vie du contenu | Conservés |
| `title`, `description`, `body` | string | Indirecte (texte libre) | Vie du contenu | **Conservés dissociés** de l'auteur anonymisé |
| `authorId` | uuid (FK User) | Rattachement | Vie du contenu | Pointe vers le User anonymisé (dissociation) |
| `createdAt`, `updatedAt` | datetime | Métadonnée | Vie du contenu | Conservés |

### Comment (`comments`) — schema.prisma:78-92

| Champ | Type | PII | Conservation | Effacement |
|-------|------|-----|--------------|------------|
| `id` | **int autoincrement** (énumérable, imposé par le contrat) | Non | Vie du contenu | Conservé |
| `body` | string | Indirecte (texte libre) | Vie du contenu | **Conservé dissocié** de l'auteur |
| `articleId`, `authorId` | uuid (FK) | Rattachement | Vie du contenu | `authorId` pointe vers le User anonymisé |
| `createdAt`, `updatedAt` | datetime | Métadonnée | Vie du contenu | Conservés |

### Tag (`tags`) — schema.prisma:95-101

Aucune donnée personnelle (`id`, `name @unique`). Pas de traitement RGPD.

### Favorite (`favorites`) — schema.prisma:105-116

| Champ | Type | PII | Effacement |
|-------|------|-----|------------|
| `userId`, `articleId` | uuid (clé composite) | **Comportementale** (qui aime quoi) | Supprimés en cascade à l'effacement du compte |
| `createdAt` | datetime | Métadonnée | Supprimé en cascade |

### Follow (`follows`) — schema.prisma:119-130

| Champ | Type | PII | Effacement |
|-------|------|-----|------------|
| `followerId`, `followingId` | uuid (clé composite) | **Relationnelle** (qui suit qui) | Supprimés en cascade à l'effacement du compte |
| `createdAt` | datetime | Métadonnée | Supprimé en cascade |

### AuditLog (`audit_logs`) — à créer, voir [04](04-logging-audit-pii-safe.md)

| Champ | Type | PII | Conservation |
|-------|------|-----|--------------|
| `id` | uuid | Non | 365 à 730 jours ([06](06-retention-purge.md)) |
| `actorRef` | string | **Pseudonyme** (userId UUID, ou HMAC de l'email si acteur sans compte) | idem |
| `action` | string | Non (ex. `gdpr.export`, `gdpr.erase`, `auth.login.failed`) | idem |
| `createdAt` | datetime | Métadonnée | idem |
| `metadata` | json | Non-PII uniquement (compteurs, codes) | idem |

## Cascade d'effacement (référence)

Toutes les FK utilisateur sont en `onDelete: Cascade` (schema.prisma). Un effacement **dur** du
`User` supprimerait donc articles, commentaires, favoris et follows. C'est pourquoi le PRD retient
l'**anonymisation** (dissociation) plutôt que la suppression dure pour le contenu public : voir
[05-droits-des-personnes.md](05-droits-des-personnes.md). Les données purement relationnelles
(`Favorite`, `Follow`) sont, elles, supprimées, car elles n'ont pas de valeur publique dissociable.

## Données hors PII

Identifiants techniques (`id`, `slug`), horodatages système, `Tag.name`, et agrégats dérivés
(`favoritesCount`, `favorited`, `following`) calculés à la volée ne constituent pas des données
personnelles isolément. Ils ne sont pas soumis aux droits d'accès/effacement en tant que tels, mais
un identifiant rattachable (`authorId`, `userId`) suit le sort de la personne concernée.

## Gate de revue

Voir [01-registre-traitements-art30.md](01-registre-traitements-art30.md) §Gate de revue :
toute évolution d'un champ PII du `schema.prisma` met à jour ce fichier **avant** la PR.
