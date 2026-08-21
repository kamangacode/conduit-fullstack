---
ref: T3
titre: Les erreurs de domaine portent un code métier, plus le corps HTTP
tier: F-lite
vague: 1
depend_de: [T1]
statut: planifie
---

# T3 — Sortir le corps §10 du domaine

## 1. Problème

`domain/shared/errors/domain.error.ts` déclare :

```ts
abstract readonly response: ErrorResponse   // { errors: { champ: [messages] } }
```

Le domaine fabrique donc le **corps de réponse HTTP verbatim**. Les quatre fichiers d'erreurs
importent `ErrorResponse`, `fieldErrors` et `CONTRACT_MESSAGES` depuis le contrat.

Le fichier assume ce choix (« le message d'erreur destiné au client est une décision métier »),
mais il contredit son propre paragraphe précédent, qui refuse le statut HTTP dans le domaine au
motif qu'« un `404` écrit ici serait du transport qui a fui dans le métier ». Refuser le code et
accepter le corps, c'est arbitrer deux fois en sens inverse sur la même frontière.

Conséquence pratique : le libellé `"has already been taken"` et la clé `credentials` sont des
choix du contrat RealWorld. Les changer, ou servir un second client avec une autre forme
d'erreur, oblige à modifier `domain/`.

Le filtre `DomainExceptionFilter` vit par ailleurs dans `infrastructure/filters/` alors qu'il est
du transport pur : il traduit un code métier en statut HTTP et sérialise une réponse Express.

## 2. Périmètre

| Fichier | Action |
|---|---|
| `domain/shared/errors/domain.error.ts` | `response` remplacé par `reason`, `ConduitErrorCode` remplacé par `DomainErrorCode` |
| `domain/article/article.errors.ts` | retirer `response`, déclarer `reason` |
| `domain/comment/comment.errors.ts` | idem |
| `domain/user/user.errors.ts` | idem |
| `interface/filters/domain-exception.filter.ts` | déplacé depuis `infrastructure/filters/` |
| `interface/filters/domain-error.mapper.ts` | créer : table `reason` vers corps §10 |
| `app.module.ts` | mettre à jour l'import du filtre |
| `docs/adr/017-messages-du-contrat-dans-shared.md` | amender la liste des consommateurs |

## 3. Décisions

**`DomainError` porte un code et une raison, pas un corps.**

```ts
export type DomainErrorCode =
  | 'validation_failed' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'

export type DomainErrorReason =
  | 'article_not_found' | 'article_not_owned'
  | 'comment_not_found' | 'comment_not_owned'
  | 'email_already_taken' | 'username_already_taken'
  | 'invalid_credentials' | 'user_not_found' | 'authenticated_user_not_found'

export abstract class DomainError extends Error {
  abstract readonly errorCode: DomainErrorCode
  abstract readonly reason: DomainErrorReason
}
```

`DomainErrorCode` duplique structurellement `ConduitErrorCode`, et c'est voulu : ce sont deux
vocabulaires qui coïncident aujourd'hui et n'ont aucune raison de rester liés. Le domaine dit
« conflit », le contrat dit « 409 ». Le mapper les rapproche.

**La garantie d'exhaustivité se déplace, elle ne disparaît pas.** Aujourd'hui on ne peut pas
oublier le corps parce que l'erreur le porte. Demain on ne peut pas l'oublier parce que la table
du mapper est déclarée `satisfies Record<DomainErrorReason, ErrorResponse>` : ajouter une raison
sans son corps ne compile pas. La propriété est équivalente, et elle est au bon endroit.

**Le filtre remonte en `interface/`.** Il est du transport (statut HTTP, `Response` Express,
corps sérialisé). Le laisser en `infrastructure/` obligerait à autoriser `@repo/shared` dans
cette couche, donc à écrire une règle depcruise à trou. Après T3, `interface/` est le seul
consommateur de `@repo/shared` côté erreurs.

**`AuthenticatedUserNotFoundError` reste un cas à surveiller.** Sa raison d'être est de produire
**exactement** le corps du refus de jeton du guard, pour qu'un jeton périmé soit indistinguable
d'un jeton forgé. Cette égalité était garantie par la lecture commune de `CONTRACT_MESSAGES`.
Après T3 elle est garantie par le mapper, qui doit produire pour `authenticated_user_not_found`
le même corps que `unauthorized('invalid')` du guard. Un test doit le prouver, pas un commentaire.

## 4. Critères d'acceptation (binaires)

- **AC-1** : aucun fichier de `domain/` n'importe `@repo/shared` au titre des erreurs.
  `grep -rn "@repo/shared" apps/api/src/domain/**/*.errors.ts apps/api/src/domain/shared/` ne
  retourne rien.
- **AC-2** : le compteur `domain-owns-its-model` de `pnpm depcruise` passe de **8 à 4** modules
  (restent les 3 ports et `user.ts`, traités en T4 à T7).
- **AC-3** : ajouter une valeur à `DomainErrorReason` sans l'ajouter à la table du mapper fait
  échouer `pnpm typecheck`. Vérifié activement, pas affirmé.
- **AC-4** : pour chacune des 9 raisons, le corps produit par le mapper est **identique octet
  pour octet** à celui que produisait l'erreur avant le lot. Couvert par un test unitaire du
  mapper qui énumère les 9 raisons.
- **AC-5** : le corps produit pour `authenticated_user_not_found` est égal à celui du refus de
  jeton du guard. Assertion explicite dans le test.
- **AC-6** : `pnpm test`, `pnpm test:integration`, `pnpm conformance` et `pnpm conformance:e2e`
  restent verts. Aucune réponse HTTP ne change.
- **AC-7** : `pnpm lint`, `pnpm typecheck`, `pnpm knip` verts.

## 5. Slices

1. Introduire `DomainErrorCode` et `DomainErrorReason` dans `domain/shared/errors/`.
2. Basculer les 9 classes d'erreur : retirer `response`, déclarer `reason`.
3. Créer `interface/filters/domain-error.mapper.ts` et son test des 9 raisons.
4. Déplacer le filtre, le brancher sur le mapper, mettre à jour `app.module.ts`.
5. Amender l'ADR 017.

## 6. Hors-scope

- Les ports de lecture et les entités (T4 à T7).
- Le corps produit par la validation Zod (`toErrorResponse`), qui vit déjà dans `interface/pipes/`
  et n'a jamais traversé le domaine.
- Le mapping code métier vers statut HTTP, déjà correct : il vit dans le filtre.
