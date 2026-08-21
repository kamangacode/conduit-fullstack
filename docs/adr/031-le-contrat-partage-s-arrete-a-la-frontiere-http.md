# ADR 031 — Le contrat partagé s'arrête à la frontière HTTP

## Status

Accepted — 2026-08-21. Amende [001 — Topologie monorepo et partage du modèle](001-topologie-monorepo-modele-partage.md)
sur la portée du partage, et [011 — Lecture des listes : port de lecture dédié](011-lecture-des-listes-port-dedie.md)
sur le **type que le port de lecture renvoie**. L'emplacement des ports, lui, ne change pas : ils
restent tous dans `domain/`.

## Context

L'ADR 001 a retenu un package partagé comme « source de vérité unique du **modèle Conduit** », et
c'est ce mot qui a produit une dérive dont ce dépôt ne s'est aperçu qu'en revue publique.

Une lecture externe du code a relevé que `ArticleQueryPort` vit dans `domain/article/ports/` tout
en important `Article` et `ArticleSummary` depuis `@repo/shared`, en connaissant `GET /api/articles`
et `/feed`, et en raisonnant sur « la forme publique d'un username ». La question posée était : ce
port appartient-il au domaine, ou est-ce un port applicatif placé là parce que la convention dit
que les ports vivent dans `domain/` ?

L'audit qui a suivi montre que le fichier cité n'est pas un cas isolé, et que le problème n'est pas
son emplacement mais la nature de ce qu'il importe. Le contenu réel de `packages/shared` est celui
d'un contrat de transport :

| Contenu | Nature |
|---|---|
| `articleResponseSchema`, `articlesResponseSchema` | enveloppes JSON de l'API |
| `createArticleDtoSchema`, `updateArticleDtoSchema` | DTOs d'entrée HTTP |
| `createdAt: z.iso.datetime()` | forme sérialisée du fil, pas une `Date` |
| `favorited`, `following` | relatifs à l'appelant HTTP |
| `CONDUIT_ERROR_STATUS` | table de statuts HTTP (422, 401, 403, 404, 409) |

Huit des dix-sept fichiers de `apps/api/src/domain/` importent ce package. La règle de dépendance
est donc inversée : le coeur métier est en aval du transport. Un changement de contrat sans
changement de règle métier force le domaine à bouger, et servir un second client dont la forme de
réponse diffère demanderait de modifier `domain/`.

Le garde-fou ne pouvait pas le voir. La règle `domain-stays-pure` de `.dependency-cruiser.cjs`
interdit les couches externes (`^src/(application|infrastructure|interface)/`) et les frameworks
(`@nestjs`, `@prisma`, `rxjs`, `express`). `@repo/shared` n'y figure pas. `pnpm depcruise` sort
vert sur 109 modules alors que la seule frontière réellement franchie du dépôt l'est partout.

L'ADR 011 aggrave le cas en affirmant, à propos de ce même port : « Le domaine reste pur (…)
`dependency-cruiser` (règle `domain-stays-pure`) continue de le vérifier mécaniquement. » La phrase
est fausse, et c'est elle qui a rendu la dérive invisible. Pour un dépôt dont la thèse est que la
propriété est vérifiée et pas seulement annoncée, l'écart est l'endroit exact où la thèse casse.

## Options Considered

| Option | Trade-off |
|---|---|
| **A. Le contrat s'arrête à `interface/` (retenue)** | `packages/shared` reste ce qu'il est, son rôle est nommé correctement, et le domaine récupère un modèle propre. Coûte un mapper par contexte dans `interface/` et la perte du raccourci « le type du port produit le format §8 ». Rend la thèse de l'ADR 001 vérifiable dans les deux sens. |
| B. Déplacer les ports de lecture sans découpler les types | Répond littéralement à la revue, à peu de frais. Écartée : `application/` importerait toujours le contrat, l'inversion de dépendance resterait entière, et la correction serait cosmétique. |
| C. Scinder `packages/shared` en `kernel` et `contract` | Le domaine importerait `kernel`, le transport `contract`. Écartée pour ce dépôt : Conduit n'a pas de vocabulaire métier réellement partagé entre le front et le back (pas d'énumération, pas de calcul commun). Le `kernel` serait vide, et le découpage un décor. |
| D. Ne rien changer, documenter l'arbitrage | Assumer le couplage comme un choix. Écartée : l'ADR 011 le prétend déjà, en s'appuyant sur une vérification mécanique qui n'existe pas. Documenter une propriété fausse est ce qui a produit la situation. |
| E. A + descendre les ports de lecture en `application/` | Répond littéralement à l'objection de la revue (« ce port appartient-il au domaine ? ») et donne un critère de placement qui se raisonne plutôt qu'une convention à mémoriser : un port vit là où vit ce qu'il protège, et un port de lecture ne protège aucun invariant. C'est la lecture CQRS, où le côté lecture n'est pas le modèle de domaine. **Écartée** : le découplage du contrat ne l'exige pas — avec un read model possédé par le dépôt, le domaine est pur que le port soit ici ou là. Ce dépôt est une démonstration publique d'architecture hexagonale ; y introduire une exception à « les ports vivent dans le domaine » demanderait au lecteur d'accepter une variante avant d'avoir vu la règle. Une seule règle, sans exception, vaut mieux qu'un critère plus fin que personne n'a demandé. |

## Decision

`packages/shared` est un **Published Language**, pas un Shared Kernel. Il porte le contrat HTTP et
rien d'autre : enveloppes de réponse, DTOs d'entrée, messages du contrat, `CONDUIT_ERROR_STATUS`.
Ses consommateurs légitimes sont `apps/web` et `apps/api/src/interface/`. **Il ne franchit pas
`interface/`.**

`apps/api/src/domain/` possède son modèle. Un type du domaine n'a pas à ressembler au fil :
`createdAt` y est une `Date` et non une chaîne ISO, une erreur métier porte un code et une raison
et non le corps `{ errors: … }`, une entité n'a pas de méthode qui prend un jeton JWT.

`apps/api/src/application/` possède l'entrée et la sortie de ses use cases. Un use case renvoie un
read model, jamais l'enveloppe du contrat : `articlesCount` est un nom de la spec RealWorld, pas un
concept métier. L'enveloppe est fabriquée par un mapper de `interface/`.

**L'emplacement des ports ne change pas.** Tous vivent dans `domain/*/ports/`, écriture comme
lecture, conformément à la règle de dépendance : le domaine déclare ce dont il a besoin,
l'infrastructure s'y conforme. Ce qui change est **ce que le port de lecture parle** : il renvoyait
`Article` et `ArticleSummary` de `@repo/shared`, il renvoie désormais des read models possédés par
le dépôt (`article-view.ts`, `comment-view.ts`).

C'est la correction minimale et suffisante : le défaut n'était pas l'emplacement du port mais sa
dépendance au contrat. Déplacer les ports de lecture vers `application/` a été envisagé, et écarté
(option E ci-dessous).

Les types que les ports parlent vivent **avec eux**, dans `domain/`. Ceux qu'un use case compose
lui-même vivent dans `application/` : `AccountView` est fabriqué à partir de l'entité et d'un jeton
que le use case vient d'émettre, `ProfileView` à partir de l'entité et d'une relation de suivi
résolue par un autre port. Aucun port ne les renvoie, ils n'ont donc rien à faire dans `domain/`.

La séparation lecture / écriture décidée par l'ADR 011 est **conservée**, y compris son motif
principal : l'adapter Prisma continue de résoudre une page en une requête, avec `following`,
`favorited` et `favoritesCount` calculés en base. Le N+1 reste structurellement absent. Seul change
le type de retour, qui devient un read model possédé par le dépôt.

La thèse de l'ADR 001 n'est pas abandonnée, elle est bornée, et elle en sort plus forte. Aujourd'hui
« renommer un champ du contrat casse `apps/api` » est vrai mais ne prouve rien, puisque ça casse
partout, y compris là où ça ne devrait pas. La propriété devient bidirectionnelle et vérifiable :
renommer un champ du contrat doit casser `apps/web` et `apps/api/src/interface/`, et **ne doit pas**
toucher `domain/` ni `application/`. C'est la forme exécutable de la présente décision, portée par
`scripts/verify-type-boundary.sh` et par la règle `shared-stays-at-the-http-boundary` de
`.dependency-cruiser.cjs`.

La règle projet correspondante est écrite dans
[`docs/architecture/frontieres-hexagonales.md`](../architecture/frontieres-hexagonales.md), dans le
dépôt et non dans `.claude/rules/`, qui n'est pas publié.

## Consequences

### Positive

- Le domaine devient réutilisable hors HTTP. Un worker, une CLI ou un second transport n'a plus à
  charger le contrat RealWorld pour instancier une règle métier.
- La garantie de frontière devient réelle au lieu d'être annoncée. Une règle depcruise unique la
  porte, et un import de `@repo/shared` dans `domain/`, `application/` ou `infrastructure/` échoue.
- La thèse du dépôt devient démontrable dans les deux sens, ce qui est un meilleur argument que la
  version d'origine.
- La règle de placement reste **unique et sans exception** : les ports vivent dans le domaine. Le
  dépôt gagne un découplage sans payer une variante à expliquer.

### Negative

- Un mapper par contexte apparaît dans `interface/` (article, comment, user, profile). C'est du
  code qui n'existait pas, et qu'il faut maintenir.
- Le raccourci « le type du port produit le format §8, donc un écart casse la compilation »
  disparaît. La garantie se déplace vers le mapper, typé `(view: ArticleView) => Article`. Elle
  reste doublée par le harnais de contrat de l'[ADR 026](026-tests-de-contrat-assertion-symetrique-et-intercepteur.md),
  qui asserte la forme sur toutes les routes et ne bouge pas, mais le filet de compilation est
  moins immédiat qu'auparavant.
- Des types de forme identique coexistent volontairement (`AuthorView` dans `domain/shared/`,
  `ProfileView` dans `application/profile/`). C'est la contrepartie assumée du refus de coupler
  deux contextes bornés, et un lecteur pressé y verra une duplication.
- L'objection de la revue publique reste **partiellement ouverte** : `ArticleQueryPort` ne porte
  toujours aucun invariant et vit toujours dans `domain/`. La réponse de cet ADR est que son
  couplage au contrat était le vrai défaut, et qu'il est corrigé ; son emplacement relève d'une
  convention que ce dépôt assume de tenir sans exception. C'est un arbitrage, pas une réfutation.
- Le coût de la correction est réel : huit lots, dont un F-full, sur quatre contextes.

### Neutral

- Aucune réponse HTTP ne change de forme. Les suites Hurl et Playwright sont le juge de paix du
  lot et doivent rester vertes à chaque étape.
- `apps/web` n'est pas concerné : il est le consommateur légitime du contrat. Seule son analyse par
  `dependency-cruiser`, jamais faite jusqu'ici, est ajoutée.
- L'[ADR 004](004-persistance-alignee-sur-le-contrat.md) porte la même inversion dans son
  raisonnement (« la persistance s'aligne sur le contrat »). Ses deux décisions concrètes,
  `Comment.id` entier et `bio` nullable, se justifient sur leurs propres mérites et ne sont pas
  remises en cause ici. Sa formulation reste à reprendre, sans urgence.
- L'[ADR 017](017-messages-du-contrat-dans-shared.md) est amendé sur un point : les classes
  d'erreur de `domain/` cessent d'être consommatrices de `CONTRACT_MESSAGES`. La table reste la
  source unique des libellés, lue désormais par le mapper d'erreurs de `interface/`.
- L'option C (scinder `shared` en kernel et contract) reste ouverte si un vocabulaire métier
  réellement partagé apparaissait. Rien ne l'exige aujourd'hui.
- L'option E (ports de lecture en `application/`) a été implémentée puis **annulée** au cours du
  même lot, la trace en est dans l'historique. Elle reste défendable et se rejouerait sans coût :
  les read models étant déjà possédés par le dépôt, seul l'emplacement des fichiers changerait.
