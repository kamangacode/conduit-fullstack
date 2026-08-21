# ADR 011 — Lecture des listes d'articles : port de lecture dédié, séparé de l'écriture

## Status

Accepted — 2026-08-05. Amendé le 2026-08-21 par
[031 — Le contrat partagé s'arrête à la frontière HTTP](031-le-contrat-partage-s-arrete-a-la-frontiere-http.md)
sur **un seul point** : le type que le port de lecture renvoie, qui devient un read model possédé
par le dépôt (`ArticleView`) au lieu de la projection du contrat partagé.

Tout le reste tient : la séparation de la lecture et de l'écriture en deux ports distincts, leur
emplacement dans `domain/*/ports/`, et la justification de la séparation (une page résolue en une
requête, le N+1 structurellement absent, les règles de domaine non diluées dans des champs relatifs
au lecteur).

## Context

`GET /api/articles` et `GET /api/articles/feed` renvoient, pour **chaque** article
de la page, davantage que l'article lui-même (PRD §8, règles R-5 et R-7) :

- l'auteur complet sous forme de `Profile`, avec son `following` — une relation
  entre l'appelant et l'auteur, pas un attribut de l'auteur ;
- `favorited` — une relation entre l'appelant et l'article ;
- `favoritesCount` — un agrégat sur la table des favoris, jamais dénormalisé
  ([ADR 002](002-modele-donnees-prisma.md)) ;
- la `tagList`, qui traverse une table de jointure ;
- et le total `articlesCount` **avant** pagination, qui n'est pas la taille de la
  page renvoyée.

Trois de ces cinq éléments dépendent de l'appelant. La même page d'articles n'a
donc pas une seule représentation : elle en a une par lecteur. Ce n'est pas un
détail de présentation, c'est ce que le contrat demande.

Les slices précédentes n'ont pas eu à trancher : `F2` ne lit que des ressources
unitaires (un compte, un profil), où la relation à l'appelant se résout par une
seule question supplémentaire. Le listing change la nature du problème — la même
question se pose pour chacun des vingt articles de la page.

La construction hexagonale de ce dépôt ([ADR 001](001-topologie-monorepo-modele-partage.md))
place les ports dans `domain/`, leurs adapters dans `infrastructure/`, et interdit
au domaine de connaître Prisma. La question n'est pas *où* vit l'accès aux
données — elle est **ce que le port renvoie** : des entités de domaine que le use
case recomposera, ou directement la projection que le contrat décrit.

## Options Considered

| Option | Trade-off |
|---|---|
| **A. Port de lecture dédié renvoyant la projection (retenue)** | `ArticleQueryPort` renvoie des `ArticleSummary` du modèle partagé, résolus en une requête où `following`, `favorited` et `favoritesCount` sont calculés en base. Le use case oriente et autorise, il ne recompose pas. Coûte une seconde abstraction d'accès aux articles (lecture *et* écriture) et déplace de la logique de projection dans du SQL généré, moins visible en TypeScript. |
| B. Repository d'entités + complétion dans le use case | Une seule notion de « dépôt d'articles », toute la composition lisible et testable en unitaire avec des doublures. Coûte au minimum quatre requêtes par listing (articles, compteurs de favoris, favoris de l'appelant, suivis de l'appelant), un N+1 dès qu'on écrit la boucle naïve, et un assemblage manuel dont la correction devient elle-même un objet de test. |
| C. Dénormaliser `favoritesCount` sur `articles` | Supprime l'agrégat de la requête de lecture. Écartée : introduit un compteur à maintenir cohérent à chaque favori/défavori, donc une classe de bugs (dérive du compteur) que l'ADR 002 avait explicitement refusée. |

## Decision

La lecture et l'écriture des articles passent par **deux ports distincts**, tous
deux déclarés dans `domain/article/ports/` :

- `ArticleRepository` — écriture et chargement unitaire pour modification. Il
  manipule l'**entité de domaine** `Article`, porteuse des règles (appartenance
  R-6, régénération du slug R-1).
- `ArticleQueryPort` — lecture des listes et de l'article unitaire destiné à
  l'affichage. Il renvoie directement les types de projection du contrat
  (`ArticleSummary`, `Article` de `@repo/shared`), et prend en paramètre
  l'identité de l'appelant, dont dépendent `following` et `favorited`.

Le use case de listing **délègue** : il valide les filtres, transmet le lecteur,
et renvoie. Il ne charge pas d'entités pour les convertir. L'adapter Prisma
correspondant résout la page en une requête, en calculant les relations
dépendantes du lecteur côté base.

C'est un CQRS *léger* — deux chemins, pas deux modèles de données ni deux
stockages. La justification est que la lecture de liste et l'écriture d'article
n'ont **pas le même objet** : l'écriture manipule un agrégat cohérent qui porte
des invariants, la lecture produit une vue dépendante du lecteur qui n'en porte
aucun. Les faire passer par la même abstraction oblige l'une des deux à mentir —
soit l'entité gagne des champs (`favorited`) qui ne sont pas les siens, soit le
use case reconstitue à la main ce que la base sait faire en une jointure.

> **Correction du 2026-08-21 (ADR 031).** Ce paragraphe portait ici l'affirmation suivante, et
> elle était fausse : *« Le domaine reste pur : `ArticleQueryPort` est une interface TypeScript, et
> les types qu'elle renvoie viennent de `@repo/shared`, qui ne dépend d'aucun framework.
> `dependency-cruiser` (règle `domain-stays-pure`) continue de le vérifier mécaniquement. »*
>
> La règle `domain-stays-pure` n'a jamais examiné `@repo/shared` : elle interdisait les couches
> externes et les frameworks, rien d'autre. `pnpm depcruise` sortait donc vert pendant que huit
> fichiers de `domain/` importaient le contrat HTTP.
>
> L'erreur de raisonnement est en amont de l'erreur de configuration : « ne dépend d'aucun
> framework » a été pris pour « appartient au domaine ». `@repo/shared` est effectivement du
> TypeScript sans dépendance technique, et c'est pourtant du transport : il porte les enveloppes de
> réponse, les DTOs d'entrée et la table `CONDUIT_ERROR_STATUS`. La pureté technique n'est pas
> l'appartenance au domaine.
>
> Le texte est conservé plutôt que supprimé : c'est la phrase qui a rendu la dérive invisible
> pendant vingt ADR, et elle vaut d'être lisible. Voir
> [ADR 031](031-le-contrat-partage-s-arrete-a-la-frontiere-http.md).

## Consequences

### Positive

- Un listing coûte une requête, quel que soit le nombre d'articles de la page :
  le N+1 n'est pas évité par discipline, il est structurellement absent.
- Les règles de domaine restent dans l'entité `Article`, non diluées dans des
  champs de présentation qui n'existent que relativement à un lecteur.
- Le contrat §8 est produit par le type même que renvoie le port : un écart de
  forme casse la compilation plutôt que d'être découvert par la suite Hurl.
- L'ajout d'un filtre (`tag`, `author`, `favorited`) se fait à un seul endroit,
  sans toucher au use case ni à l'entité.

### Negative

- Deux ports pour une même notion : un contributeur doit savoir lequel prendre.
  L'arbitrage est écrit ici et rappelé en commentaire d'en-tête des deux ports —
  « je modifie » prend le repository, « j'affiche » prend le port de lecture.
- La logique de projection (jointures, agrégats, calcul de `following` /
  `favorited`) descend dans l'adapter, donc hors de portée des tests unitaires à
  doublures. Elle est couverte par des tests d'**intégration sur base réelle**,
  qui sont plus lents — la lane existe déjà et c'est le bon endroit pour cette
  logique, mais le coût de vérification est réel.
- Le use case de listing devient fin au point de sembler superflu. Il ne l'est
  pas : c'est lui qui porte l'exigence d'authentification du `/feed` (R-4) et la
  résolution du lecteur. Sa minceur est un symptôme correct, pas un défaut.

### Neutral

- Aucun second stockage, aucune projection matérialisée, aucun bus d'événements :
  la séparation est celle des **chemins de code**, pas celle des données. Le
  terme CQRS est utilisé ici dans son acception la plus faible.
- L'article unitaire (`GET /api/articles/:slug`) passe par le port de lecture,
  bien qu'il n'ait pas de problème de N+1 : la cohérence de forme entre l'article
  seul et l'article en liste vaut mieux que deux chemins de production pour la
  même structure.
- La création et la mise à jour renvoient elles aussi un article complet. Elles
  écrivent via le repository, puis relisent via le port de lecture — un aller
  supplémentaire, accepté pour que la réponse soit produite par un seul endroit.
- **2026-08-08 — le rayon d'action d'un défaut de projection, mesuré.** Le
  harnais de contrat (item C3, [ADR 026](026-tests-de-contrat-assertion-symetrique-et-intercepteur.md))
  a injecté deux champs hors contrat dans la projection du port de lecture, puis
  interrogé `GET /api/articles/:slug`. Il a relevé **deux** écarts, pas un :
  `POST /api/articles` en portait le même, parce que la publication relit par ce
  port au lieu de fabriquer sa réponse — la conséquence exacte de la puce
  ci-dessus, jamais écrite jusqu'ici. Elle se lit dans les deux sens : un défaut
  de projection se corrige **à un seul endroit** pour tous les endpoints d'article,
  et il se manifeste sur des endpoints qu'on n'aurait pas soupçonnés, dont ceux
  d'écriture. À savoir avant de diagnostiquer un écart de forme sur un `POST` en
  cherchant la cause dans le chemin d'écriture.
