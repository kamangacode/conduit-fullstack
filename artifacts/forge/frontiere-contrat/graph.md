---
title: Recentrer @repo/shared sur le contrat HTTP et rendre au domaine son modèle
epic: frontiere-contrat
status: approved
created: 2026-08-21
tracker: aucun — lots traités en local, sans issue GitHub
waves:
  - [T1, T2]
  - [T3]
  - [T4, T5, T6, T7]
  - [T8]
---

# Graphe d'exécution — frontière du contrat

## Origine

Une revue publique du dépôt (commentaire LinkedIn, 2026-08-21) relève que
`ArticleQueryPort` vit dans `domain/article/ports/` alors qu'il importe `Article` et
`ArticleSummary` depuis `@repo/shared`, connaît `GET /api/articles` et `/feed`, et raisonne sur
« la forme publique d'un username ». La question posée est juste : ce port appartient-il au
domaine, ou est-ce un port applicatif de lecture placé là par convention ?

L'audit qui a suivi montre que le fichier cité n'est pas un cas isolé mais le symptôme d'une
confusion de rôle dans `packages/shared`.

## Le défaut de fond

`packages/shared` est décrit par l'[ADR 001](../../../docs/adr/001-topologie-monorepo-modele-partage.md)
comme « source de vérité unique du **modèle Conduit** ». Son contenu réel dit autre chose : enveloppes
de réponse (`articleResponseSchema`, `articlesResponseSchema`), DTOs d'entrée
(`createArticleDtoSchema`), dates ISO en chaînes, champs relatifs à l'appelant HTTP
(`favorited`, `following`), et surtout la table `CONDUIT_ERROR_STATUS` qui associe un code
métier à un statut HTTP.

C'est un **Published Language**, pas un Shared Kernel. Le domaine l'importe dans 8 de ses
17 fichiers. La règle de dépendance est donc inversée : le cœur métier est en aval du transport,
et un changement de contrat sans changement de règle métier force le domaine à bouger.

## Ce que le garde-fou ne voyait pas

`pnpm depcruise` est vert : 109 modules, 0 violation. Sa règle `domain-stays-pure` interdit
`^src/(application|infrastructure|interface)/` et les frameworks (`@nestjs`, `@prisma`, `rxjs`,
`express`). `@repo/shared` n'y figure pas. **La seule frontière réellement franchie est la seule
qui n'était pas gardée.**

Aggravant : l'[ADR 011](../../../docs/adr/011-lecture-des-listes-port-dedie.md) affirme que
« `dependency-cruiser` (règle `domain-stays-pure`) continue de le vérifier mécaniquement ». Cette
phrase a rendu la dérive invisible. Pour un dépôt dont la thèse est « la propriété est vérifiée,
pas seulement annoncée », c'est l'écart le plus coûteux du lot.

## La cible

```
packages/shared          Published Language : DTOs, enveloppes, messages,
                         statuts HTTP. Contrat avec le front.
        |                          |
   apps/web        apps/api/src/interface/     <- seuls consommateurs autorisés
                              |
                   application/  (entrée et sortie owned par le use case)
                              |
                   domain/       (modèle métier propre, 0 import shared)
```

Une règle, écrivable en une clause depcruise : **`@repo/shared` ne franchit pas `interface/`.**

La thèse de l'ADR 001 n'est pas abandonnée, elle est bornée, et elle en sort **plus forte**.
Aujourd'hui « renommer un champ du contrat casse `apps/api` » est vrai mais ne prouve rien : ça
casse partout, y compris là où ça ne devrait pas. Après ce lot, la propriété devient
bidirectionnelle et vérifiable : renommer un champ doit casser `apps/web` et
`apps/api/src/interface/`, et **ne doit pas** toucher `domain/` ni `application/`.

## Révision du 2026-08-21 : les ports de lecture restent dans le domaine

Les lots T4, T5 et T7 ont d'abord **descendu** `ArticleQueryPort`, `CommentQueryPort` et
`TagQueryPort` en `application/*/ports/`, au motif qu'un port vit là où vit ce qu'il protège et
qu'un port de lecture ne protège aucun invariant. C'était la réponse littérale à l'objection de la
revue publique.

Ce déplacement a été **annulé** après arbitrage. Deux raisons, et la seconde est celle qui décide :

1. Le découplage du contrat ne l'exigeait pas. Avec un read model possédé par le dépôt, le domaine
   est pur que le port soit dans `domain/` ou dans `application/` : `depcruise`, la propriété
   bidirectionnelle et la conformité sont identiques dans les deux cas.
2. Ce dépôt est une **démonstration publique d'architecture hexagonale**. Y introduire une exception
   à « les ports vivent dans le domaine » demanderait au lecteur d'accepter une variante avant
   d'avoir vu la règle. Une seule règle tenue sans exception vaut mieux qu'un critère plus fin que
   personne n'a demandé.

Les read models que ces ports parlent (`ArticleView`, `CommentView`, `AuthorView`, `ViewerId`) sont
donc dans `domain/`, avec les ports. Ceux qu'un use case **compose** lui-même (`AccountView`,
`ProfileView`) restent dans `application/` : aucun port ne les renvoie.

L'option est tracée en E dans l'[ADR 031](../../../docs/adr/031-le-contrat-partage-s-arrete-a-la-frontiere-http.md),
et l'ADR 011 revient de `Superseded` à `Accepted (amendé par 031)` : il n'est plus remplacé, il est
amendé sur un seul point, le type que le port renvoie.

## Découpage : par contexte borné, pas par classe de défaut

Le découpage naturel serait par symptôme (erreurs, entités, ports, enveloppes). Il est écarté :
déplacer `ArticleQueryPort` sans toucher aux use cases qui le consomment ne compile pas. Un lot
par symptôme produirait des commits non verts, donc non relisables isolément.

Le découpage retenu suit les **contextes bornés**. Chaque lot migre article, ou comment, ou user,
de bout en bout, et laisse le dépôt vert.

| ref | lot | tier | dépend de | vague | portée |
|---|---|---|---|---|---|
| T1 | ADR 031, amendement 001 et 011, REQ-ARCH-001 | F-lite | — | 0 | 6 fichiers docs + 1 script |
| T2 | Garde-fou depcruise en `warn` + règle projet écrite | F-lite | T1 | 0 | 3 fichiers |
| T3 | Les erreurs de domaine portent un code, plus le corps HTTP | F-lite | T1 | 1 | 4 fichiers domaine + filtre déplacé |
| T4 | article : port de lecture applicatif, read model, mapper | F-full | T3 | 2 | ~12 fichiers |
| T5 | comment : scinder écriture (domaine) et lecture (application) | F-lite | T3 | 2 | ~8 fichiers |
| T6 | user et profile : l'entité ne fabrique plus les projections | F-lite | T3 | 2 | ~10 fichiers |
| T7 | tag : descendre `TagQueryPort` en application | S | T3 | 2 | 4 fichiers |
| T8 | Passer les règles en `error`, étendre à web et shared | F-lite | T4 T5 T6 T7 | 3 | 3 fichiers |

## Arêtes de dépendance

- **T2 ← T1** : le commentaire des règles depcruise cite l'ADR 031. Poser la règle avant la
  décision produirait une référence morte.
- **T3 ← T1** : même raison, et T3 amende l'ADR 017.
- **T4 T5 T6 T7 ← T3** : T3 est le seul lot transverse, il touche `domain/{article,comment,user}/*.errors.ts`.
  Le passer avant la vague 2 évite quatre conflits garantis sur les mêmes fichiers.
- **T8 ← T4 T5 T6 T7** : la bascule `warn` vers `error` n'est vraie qu'une fois les quatre
  contextes migrés.

## Parallélisme de la vague 2

T4, T5, T6 et T7 ont des périmètres fichiers disjoints côté domaine, application et persistance.
Le seul point de contact est `interface/article/article.controller.ts`, que T4 et T5 modifient
tous les deux (il porte les routes d'article **et** de commentaire). En exécution locale
séquentielle, T4 passe avant T5 et la question ne se pose pas.

## Ce que ce lot ne fait pas

- **Il ne touche pas au contrat externe.** Aucune réponse HTTP ne change de forme. La suite Hurl
  et la suite Playwright sont le juge de paix : elles doivent rester vertes à chaque commit.
- **Il ne remet pas en cause l'ADR 011 sur le fond.** Séparer lecture et écriture reste la bonne
  décision, et le N+1 reste structurellement absent : l'adapter Prisma continue de résoudre une
  page en une requête, il remplit un read model maison au lieu du DTO.
- **Il ne touche pas à `apps/web`.** Le front est le consommateur légitime du contrat. Seule son
  analyse par depcruise est ajoutée (T8).
- **Il ne traite pas l'ADR 004.** « La persistance s'aligne sur le contrat » porte la même
  inversion de raisonnement, mais ses deux décisions concrètes (`Comment.id` entier, `bio`
  nullable) se justifient sur leurs propres mérites. À reformuler plus tard, sans urgence.
