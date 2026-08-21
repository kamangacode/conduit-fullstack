---
ref: T6
titre: user et profile — l'entité ne fabrique plus les projections
tier: F-lite
vague: 2
depend_de: [T3]
statut: planifie
---

# T6 — Le JWT n'a rien à faire dans une entité

## 1. Problème

`domain/user/user.ts` déclare deux méthodes de projection sur l'agrégat :

```ts
toProfile(following: boolean): Profile
toUser(token: string): User
```

`Profile` et `User` sont des DTOs du contrat. `toUser` est le cas le plus net du dépôt : une
**entité de domaine prend un JWT en paramètre** pour construire une réponse d'API. Le jeton n'a
aucune existence métier ; le commentaire du fichier le reconnaît d'ailleurs (« il n'appartient pas
au compte : il est émis par un service d'infrastructure »). C'est l'aveu que la méthode est mal
placée.

Les commentaires de ces méthodes défendent une bonne propriété — l'énumération champ par champ
empêche `passwordHash` de fuiter par un étalement de `props` — mais cette propriété n'a pas besoin
de vivre dans l'entité. Elle vit tout aussi bien dans un mapper typé.

Les 7 use cases de `user` et `profile` renvoient `User` ou `Profile`.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `domain/user/user.ts` | `toProfile` et `toUser` retirés, accesseurs conservés |
| `application/shared/…` | read models `AccountView` et `ProfileView` |
| `application/user/*.use-case.ts` (4) | signatures de sortie en read model |
| `application/profile/*.use-case.ts` (3) | idem |
| `interface/user/user.mapper.ts` | créé |
| `interface/profile/profile.mapper.ts` | créé |
| `interface/user/user.controller.ts` | appelle le mapper |
| `interface/profile/profile.controller.ts` | idem |
| `interface/auth/auth.guard.ts` | vérifié : il manipule `UserEntity`, pas de DTO |

## 3. Décisions

**Deux read models, pas un.**

```ts
export interface ProfileView {          // projection publique
  readonly username: string
  readonly bio: string | null
  readonly image: string | null
  readonly following: boolean
}

export interface AccountView {          // projection privée, porte l'email
  readonly email: string
  readonly username: string
  readonly bio: string | null
  readonly image: string | null
  readonly token: string
}
```

`AuthorView` de T4 et `ProfileView` restent **distincts** malgré leur forme identique. Ils ne
répondent pas à la même question : `AuthorView` décrit l'auteur d'un contenu tel qu'une requête
de lecture le résout, `ProfileView` est le résultat du cas d'usage « consulter un profil ». Les
fusionner créerait un couplage entre le contexte article et le contexte profile que rien ne
justifie. Si la duplication devient gênante, c'est une décision à prendre plus tard, avec sa
propre trace.

**`token` reste dans `AccountView`.** Ce n'est pas une régression : `AccountView` est un type
applicatif, pas un type de domaine. Le use case a légitimement affaire au jeton, puisque c'est lui
qui l'émet via `TokenService`. Ce que T6 corrige, c'est que **l'entité** n'y touche plus.

**La garantie anti-fuite se déplace vers le type.** Aujourd'hui elle repose sur l'énumération
champ par champ dans l'entité. Demain elle repose sur `AccountView` et `ProfileView`, qui ne
déclarent tout simplement pas `passwordHash`. Un mapper qui tenterait de l'y mettre ne compile
pas. La propriété est plus forte, pas plus faible, et le commentaire qui la défendait descend
avec le mapper.

**`UserEntity` gagne un accesseur, elle n'en perd pas.** Les mappers ont besoin de lire
`username`, `bio`, `image`, `email` : tous les accesseurs existent déjà. Aucune donnée nouvelle
n'est exposée.

## 4. Critères d'acceptation (binaires)

- **AC-1** : `apps/api/src/domain/user/` ne contient plus aucun import de `@repo/shared`.
- **AC-2** : `apps/api/src/application/{user,profile}/` non plus.
- **AC-3** : `grep -n "token" apps/api/src/domain/user/user.ts` ne retourne rien. Aucune méthode
  de l'entité ne prend un jeton.
- **AC-4** : ni `AccountView` ni `ProfileView` ne déclarent `passwordHash`. Un test prouve qu'aucune
  réponse d'authentification ne le porte (test existant conservé, cible mise à jour).
- **AC-5** : `pnpm conformance` vert. `POST /api/users`, `POST /api/users/login`, `GET /api/user`,
  `PUT /api/user`, `GET /api/profiles/:username` et les deux routes de suivi renvoient la même forme.
- **AC-6** : le compteur `domain-owns-its-model` descend de 2 à 1, `application-owns-its-io` de
  8 à 1.
- **AC-7** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm knip` verts.

## 5. Slices

1. Déclarer `ProfileView` et `AccountView` côté application.
2. Écrire les deux mappers et leurs tests, avant de toucher à l'entité.
3. Retirer `toProfile` et `toUser` de `UserEntity`, adapter ses specs.
4. Basculer les 7 use cases, puis les deux controllers.

## 6. Hors-scope

- Fusionner `AuthorView` et `ProfileView`.
- Le guard, qui manipule déjà `UserEntity` et n'a jamais produit de DTO.
- Le chiffrement PII et le blind index sur l'email, sujet ouvert par ailleurs (issue #43).
