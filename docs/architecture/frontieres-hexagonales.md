# Frontières hexagonales de `apps/api`

Cette page est la règle de placement du code backend. Elle est **exécutable** : ce qu'elle énonce
est vérifié par [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs), lancé en pre-push
(`lefthook.yml`) et dans le job CI `Quality`. Une règle d'architecture qu'aucun outil ne lit se
dégrade en intention, et ce dépôt en a fait l'expérience (voir la section « Ce qui a raté » plus
bas).

Décisions de référence : [ADR 001](../adr/001-topologie-monorepo-modele-partage.md) pour la
topologie du monorepo, [ADR 031](../adr/031-le-contrat-partage-s-arrete-a-la-frontiere-http.md) pour
la portée du contrat partagé.

## Les quatre couches

Les dépendances pointent **toujours vers l'intérieur**. Le coeur ne connaît rien de l'extérieur.

| Couche | Contenu | Peut dépendre de |
|---|---|---|
| `interface/` | Controllers NestJS, guards, pipes, intercepteurs, filtres d'exception, **mappers** | tout le reste, plus `@repo/shared` |
| `infrastructure/` | Adapters (Prisma, argon2id, jose), services techniques | `domain/`, `application/` |
| `application/` | Use cases, et les vues qu'ils composent eux-mêmes | `domain/` |
| `domain/` | TypeScript pur : entités, value objects, **tous les ports**, read models, erreurs métier | rien |

## La règle qui a manqué : `@repo/shared` s'arrête à `interface/`

`packages/shared` **n'est pas un modèle métier**. C'est le contrat HTTP : enveloppes de réponse
(`{ article: … }`, `{ articles, articlesCount }`), DTOs d'entrée, messages du contrat, et la table
`CONDUIT_ERROR_STATUS` qui associe un code métier à un statut HTTP. En vocabulaire DDD, c'est un
**Published Language**, pas un Shared Kernel.

Ses consommateurs légitimes sont exactement deux : `apps/web`, et `apps/api/src/interface/`.

```
packages/shared          contrat HTTP
        |                          |
   apps/web              apps/api/src/interface/
                                   |
                          application/     entrée et sortie owned par le use case
                                   |
                          domain/          modèle métier propre
```

Concrètement :

- un type du domaine n'a pas à ressembler au fil : `createdAt` y est une `Date`, pas une chaîne
  ISO 8601 ;
- une erreur métier porte un **code** et une **raison**, jamais le corps `{ errors: … }` ;
- une entité n'a pas de méthode qui prend un jeton JWT en paramètre ;
- un use case renvoie un **read model**, jamais l'enveloppe du contrat. `articlesCount` est un nom
  de la spec RealWorld, pas un concept métier. L'enveloppe est fabriquée par un mapper de
  `interface/`.

## Où placer un port, et où placer une vue

**Tous les ports vivent dans `domain/*/ports/`**, écriture comme lecture. Une seule règle, sans
exception : le domaine déclare ce dont il a besoin, l'infrastructure s'y conforme.

L'objection existe et mérite d'être connue : `ArticleQueryPort` ne porte aucun invariant, il sert un
affichage, et une lecture CQRS le placerait en `application/`. Ce dépôt a implémenté ce déplacement
puis l'a annulé (option E de l'[ADR 031](../adr/031-le-contrat-partage-s-arrete-a-la-frontiere-http.md)) :
le découplage du contrat ne l'exigeait pas, et une démonstration publique d'architecture hexagonale
gagne à tenir sa règle sans variante à expliquer avant même que la règle soit vue.

La séparation lecture / écriture, elle, vient de l'[ADR 011](../adr/011-lecture-des-listes-port-dedie.md)
et reste en vigueur : une page d'articles est résolue en **une** requête, avec `following`,
`favorited` et `favoritesCount` calculés en base. Le N+1 n'est pas évité par discipline, il est
structurellement absent. Repère pratique : **« j'affiche »** prend le port de lecture, **« je
modifie »** prend le repository.

Pour les **vues**, le critère est différent et il est mécanique :

| Vue | Emplacement | Pourquoi |
|---|---|---|
| `ArticleView`, `ArticleListPage`, `CommentView`, `AuthorView`, `ViewerId` | `domain/` | Un port les renvoie ou les prend en paramètre. Un type qu'un port parle vit avec le port, sinon `domain/` importerait `application/`. |
| `AccountView`, `ProfileView` | `application/` | Aucun port ne les renvoie. Le use case les **compose** : `AccountView` à partir de l'entité et d'un jeton qu'il vient d'émettre, `ProfileView` à partir de l'entité et d'une relation de suivi résolue par un autre port. |

`AuthorView` et `ViewerId` vivent dans `domain/shared/` et non dans le contexte article : ils sont
partagés par la lecture d'articles et celle de commentaires, et les déclarer dans l'un des deux
créerait une arête `comment -> article` que rien ne justifie.

## Ce qui a raté, et pourquoi c'est écrit ici

Jusqu'au 2026-08-21, la règle `domain-stays-pure` de `.dependency-cruiser.cjs` interdisait au
domaine deux choses : les couches externes et les frameworks (`@nestjs`, `@prisma`, `rxjs`,
`express`). `@repo/shared` n'y figurait pas.

`pnpm depcruise` sortait donc **vert** sur 109 modules pendant que huit des dix-sept fichiers de
`domain/` importaient le contrat HTTP. L'ADR 011 affirmait même que la pureté du domaine était
« vérifiée mécaniquement ». Le défaut a été relevé par une revue externe, pas par l'outillage.

L'erreur de raisonnement, en amont de l'erreur de configuration : « ne dépend d'aucun framework » a
été pris pour « appartient au domaine ». `@repo/shared` est effectivement du TypeScript sans
dépendance technique, et c'est pourtant du transport. **La pureté technique n'est pas
l'appartenance au domaine.**

Deux leçons qui valent au-delà de ce dépôt :

1. Une règle d'architecture doit nommer ce qu'elle interdit, pas ce qu'elle suppose. `domain-stays-pure`
   décrivait une intention ; elle listait une poignée de packages.
2. Un garde-fou vert n'est une preuve que si l'on a vérifié qu'il peut rougir. La bascule
   `warn` vers `error` de la règle de frontière s'accompagne d'un test actif : on ajoute un import
   interdit, on constate l'échec, on annule.
3. **Vérifier qu'il rougit ne suffit pas : il faut vérifier dans quelles conditions il aveugle.**
   La règle de frontière compare des chemins **résolus**. Sans `packages/shared/dist`,
   `@repo/shared` ne se résout pas, la règle ne voit plus rien, et `depcruise` sort vert avec un
   import interdit dans `domain/`. Un clone frais est exactement dans cet état, et le pre-push
   lance `depcruise` avant `typecheck`. La règle `no-unresolvable` ferme ce trou : un import que le
   resolver ne sait pas suivre est une erreur, précisément parce qu'il rend les autres règles
   aveugles sur lui. Ce défaut a été relevé en revue de code, pas par l'outillage — la deuxième
   fois dans cette histoire.

## Vérifier

```bash
pnpm depcruise      # frontières et cycles, 0 erreur exigée
pnpm typecheck      # les trois workspaces
bash scripts/verify-type-boundary.sh   # la frontière est-elle une dépendance de compilation
```

## État de la migration : terminée

La règle a été posée en `warn` le temps que la dette existante soit résorbée, sur le modèle de ce
qui se fait ailleurs dans l'écosystème : nommer la dette, la compter, la faire descendre. Elle est
passée en `error` le 2026-08-21, les deux compteurs étant à zéro.

| Compteur (règle de migration) | Au départ | À l'arrivée |
|---|---|---|
| `domain-owns-its-model` | 8 modules | 0 |
| `application-owns-its-io` | 18 modules (dont 1 spec) | 0 |

Les deux règles ont fusionné en **`shared-stays-at-the-http-boundary`**, en `error`, qui couvre en
plus `infrastructure/`. Le plan de résorption et ses huit lots restent lisibles dans
`artifacts/forge/frontiere-contrat/`.

L'analyse couvre désormais les **trois** workspaces (`pnpm depcruise`), soit environ 266 modules
contre 136 auparavant : `apps/web` et `packages/shared` n'avaient jamais été cruisés. Aucune règle
de couche ne s'y applique (le front n'a pas d'architecture hexagonale à garder) ; ce qu'on y attend
d'eux est l'absence de cycles et d'orphelins.

## Ce que la frontière donne, mesuré

Renommer un champ du contrat dans `packages/shared` :

| Couche | Avant l'ADR 031 | Après |
|---|---|---|
| `apps/web` | casse | casse |
| `apps/api/src/interface/` | casse | casse |
| `apps/api/src/application/` | **cassait** | ne bouge pas |
| `apps/api/src/domain/` | cassait | ne bouge pas |

`scripts/verify-type-boundary.sh` vérifie les quatre lignes de ce tableau à chaque pre-push, en
provoquant réellement le renommage. C'est la forme exécutable de l'ADR 031, et une propriété plus
forte que celle d'origine : une thèse qui casse partout ne prouve rien.
