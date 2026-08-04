# 004 — Identifiant de commentaire : entier imposé par le contrat

## Status

Accepted — 2026-08-04. Amende [002 — Modèle de données Prisma](002-modele-donnees-prisma.md) sur le seul modèle `Comment`.

## Context

L'ADR 002 a retenu l'UUID comme identifiant de toutes les entités persistées, pour des raisons homogènes et défendables : pas d'énumération des ressources, pas de dépendance à une séquence, génération possible côté application.

En construisant le modèle partagé (`packages/shared`, item F1), la confrontation au contrat externe a révélé une divergence sur `Comment` :

- `specs/api/openapi.yml` (contrat officiel RealWorld) déclare `Comment.id` en `type: integer` ;
- le format de réponse verbatim de la spec le montre sérialisé en nombre : `"id": 1` ;
- le PRD reprend la même contrainte (§6, « id | int »).

Les autres entités ne sont pas concernées : `Article` est adressé par son `slug`, `User` et `Profile` par leur `username`. Le commentaire est la seule ressource dont l'identifiant technique traverse le contrat, via `DELETE /api/articles/:slug/comments/:id`.

La conformité n'est pas négociable dans ce repo : la suite Hurl RealWorld est le gate de la Phase F, et c'est elle qui rend les cinq implémentations Conduit rigoureusement comparables. Un `id` de type différent est un écart de contrat, pas un détail d'implémentation.

## Options Considered

**A. Aligner la persistance sur le contrat** — `Comment.id` devient `Int @id @default(autoincrement())`. Le type traverse toutes les couches sans traduction.

**B. UUID interne + identifiant public séquentiel** — la clé primaire reste un UUID, une colonne `publicId Int @unique @default(autoincrement())` porte l'identifiant du contrat. Conserve la propriété de non-énumération de l'ADR 002, au prix de deux identifiants à maintenir : chaque use case et chaque repository doit savoir lequel il manipule, et une confusion entre les deux est un bug silencieux.

**C. Exposer l'UUID en chaîne** — dévie du contrat officiel. Fait peser un risque direct sur le gate de la Phase F et casse la comparabilité avec les quatre repos de la spine Java.

## Decision

**Option A.** `Comment.id` passe d'UUID à entier auto-incrémenté. Le modèle partagé le déclare `z.number().int().positive()` (`packages/shared/src/model/comment.ts`), et le schéma Prisma sera aligné avec sa migration lors de l'implémentation de l'API des commentaires (item F3).

L'option B résout le même problème en ajoutant un concept ; ici la propriété qu'elle préserve — la non-énumération — n'a pas de valeur défensive réelle. Les commentaires sont **publics** : `GET /api/articles/:slug/comments` les liste tous, sans authentification. Deviner un identifiant ne donne accès à rien que le contrat ne donne déjà, et la suppression reste protégée par la vérification d'appartenance (règle R-6). Payer un identifiant supplémentaire pour masquer une donnée publique serait une complexité sans contrepartie.

## Consequences

### Positive

- Conformité au contrat officiel sans couche de traduction, donc sans endroit où l'oublier.
- Un seul identifiant par commentaire : les repositories et use cases n'ont pas à choisir lequel manipuler.
- La divergence est tranchée **avant** l'écriture de l'API des commentaires, pas découverte au moment où la suite Hurl échoue.

### Negative

- Le modèle de données perd son homogénéité : une entité sur cinq n'utilise pas d'UUID. C'est le contrat externe qui l'impose, et l'écart est documenté ici plutôt que subi à la lecture du schéma.
- Les identifiants de commentaires deviennent énumérables. Acceptable : la ressource est publique en lecture, et l'écriture reste gardée par R-6.
- La migration Prisma correspondante change le type d'une clé primaire. Elle est écrite en F3, alors qu'aucune donnée de production n'existe encore — c'est précisément la fenêtre où ce changement est gratuit.

### Neutral

- L'ADR 002 reste valide pour `User`, `Article`, `Tag`, `Favorite` et `Follow`, qui conservent leurs UUID.
- Le contrat externe ne change pas : il est simplement respecté.
