# ADR 004 — Persistance alignée sur le contrat (identifiant de commentaire, bio nullable)

## Status

Accepted — 2026-08-04, élargi le 2026-08-05 à `User.bio`. Amende [002 — Modèle de données Prisma](002-modele-donnees-prisma.md) sur `Comment.id` et `User.bio` ; les autres décisions de l'ADR 002 restent valides. Amendé par [017 — Les messages d'erreur du contrat vivent dans `packages/shared`](017-messages-du-contrat-dans-shared.md), qui déplace la normalisation d'un champ nullable vide de la persistance vers le contrat partagé.

## Context

L'ADR 002 a retenu l'UUID comme identifiant de toutes les entités persistées, pour des raisons homogènes et défendables : pas d'énumération des ressources, pas de dépendance à une séquence, génération possible côté application.

En construisant le modèle partagé (`packages/shared`, item F1), la confrontation au contrat externe a révélé une divergence sur `Comment` :

- `specs/api/openapi.yml` (contrat officiel RealWorld) déclare `Comment.id` en `type: integer` ;
- le format de réponse verbatim de la spec le montre sérialisé en nombre : `"id": 1` ;
- le PRD reprend la même contrainte (§6, « id | int »).

Les autres entités ne sont pas concernées par l'identifiant : `Article` est adressé par son `slug`, `User` et `Profile` par leur `username`. Le commentaire est la seule ressource dont l'identifiant technique traverse le contrat, via `DELETE /api/articles/:slug/comments/:id`.

La revue du modèle partagé a mis au jour une **seconde divergence de la même famille**, sur `User.bio` :

- `openapi.yml` déclare `bio` en `type: [string, 'null']`, et le champ est **requis** dans la réponse ;
- l'exemple canonique de `specifications/backend/api-response-format.md` montre `"bio": null` pour un utilisateur qui vient de s'authentifier ;
- `schema.prisma` déclare `bio String @default("")`, donc non nullable.

Un compte fraîchement inscrit renverrait `""` là où la spec montre `null`. Le contrat tolère les deux valeurs, mais l'écart n'est pas neutre : il oblige chaque adapter à choisir une convention (`"" ` ou `null`) sans que rien ne l'impose, et deux endroits qui choisissent différemment produisent une réponse incohérente pour la même donnée absente.

La conformité n'est pas négociable dans ce repo : la suite Hurl RealWorld est le gate de la Phase F, et c'est elle qui rend les cinq implémentations Conduit rigoureusement comparables. Un `id` de type différent est un écart de contrat, pas un détail d'implémentation.

## Options Considered

**A. Aligner la persistance sur le contrat** — `Comment.id` devient `Int @id @default(autoincrement())`. Le type traverse toutes les couches sans traduction.

**B. UUID interne + identifiant public séquentiel** — la clé primaire reste un UUID, une colonne `publicId Int @unique @default(autoincrement())` porte l'identifiant du contrat. Conserve la propriété de non-énumération de l'ADR 002, au prix de deux identifiants à maintenir : chaque use case et chaque repository doit savoir lequel il manipule, et une confusion entre les deux est un bug silencieux.

**C. Exposer l'UUID en chaîne** — dévie du contrat officiel. Fait peser un risque direct sur le gate de la Phase F et casse la comparabilité avec les quatre repos de la spine Java.

## Decision

**Option A**, appliquée aux deux divergences : la persistance s'aligne sur le contrat, pas l'inverse.

- `Comment.id` passe d'UUID à entier auto-incrémenté. Le modèle partagé le déclare `z.number().int().positive()` (`packages/shared/src/model/comment.ts`).
- `User.bio` passe de `String @default("")` à `String?`. Le modèle partagé le déclare déjà `z.string().nullable()` (`packages/shared/src/model/user.ts`, `profile.ts`) : c'est la base qui rattrape le contrat.

Les deux changements de schéma Prisma sont portés par les migrations qui accompagneront l'implémentation de l'API — auth et profils pour `bio` (item F2), commentaires pour `Comment.id` (item F3).

Sur `bio`, représenter « pas de biographie » par `null` plutôt que par `""` a une raison au-delà de la conformité : la chaîne vide est une valeur légitime que l'utilisateur peut saisir, `null` est l'absence de valeur. Les confondre au niveau de la base rend impossible de distinguer « n'a jamais rempli sa bio » de « l'a effacée » — et c'est exactement la distinction que `PUT /api/user` demande de traiter, puisque le contrat y accepte `bio: null` comme instruction d'effacement.

L'option B résout le même problème en ajoutant un concept ; ici la propriété qu'elle préserve — la non-énumération — n'a pas de valeur défensive réelle. Les commentaires sont **publics** : `GET /api/articles/:slug/comments` les liste tous, sans authentification. Deviner un identifiant ne donne accès à rien que le contrat ne donne déjà, et la suppression reste protégée par la vérification d'appartenance (règle R-6). Payer un identifiant supplémentaire pour masquer une donnée publique serait une complexité sans contrepartie.

## Consequences

### Positive

- Conformité au contrat officiel sans couche de traduction, donc sans endroit où l'oublier.
- Un seul identifiant par commentaire : les repositories et use cases n'ont pas à choisir lequel manipuler.
- Les deux divergences sont tranchées **avant** l'écriture des API concernées, pas découvertes au moment où la suite Hurl échoue.
- `bio` nullable rend représentable la distinction « jamais renseignée » / « effacée », que `PUT /api/user` exige de traiter.

### Negative

- Le modèle de données perd son homogénéité : une entité sur cinq n'utilise pas d'UUID. C'est le contrat externe qui l'impose, et l'écart est documenté ici plutôt que subi à la lecture du schéma.
- Les identifiants de commentaires deviennent énumérables. Acceptable : la ressource est publique en lecture, et l'écriture reste gardée par R-6.
- La migration Prisma correspondante change le type d'une clé primaire. Elle est écrite en F3, alors qu'aucune donnée de production n'existe encore — c'est précisément la fenêtre où ce changement est gratuit.
- `bio` nullable ajoute un cas `null` à traiter partout où la biographie est lue. C'est le coût assumé de rendre l'absence explicite plutôt que de la déguiser en chaîne vide ; le modèle partagé le rend visible à la compilation des deux côtés.

### Neutral

- L'ADR 002 reste valide pour `User`, `Article`, `Tag`, `Favorite` et `Follow`, qui conservent leurs UUID.
- Le contrat externe ne change pas : il est simplement respecté.
- Ces deux divergences ont la même origine — un schéma de persistance écrit avant d'avoir confronté le contrat champ par champ. Le modèle partagé, écrit lui à partir du contrat, joue depuis le rôle de révélateur.
