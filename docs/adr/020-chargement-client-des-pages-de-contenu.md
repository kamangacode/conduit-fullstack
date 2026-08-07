# ADR 020 — Charger l'article, le profil et l'éditeur depuis le navigateur

## Status

Accepted — 2026-08-06. Amende [012 — Rendu hybride et session cliente](012-rendu-hybride-et-session-client.md) et [015 — Préchargement serveur et hydratation du cache](015-prechargement-serveur-et-hydratation-du-cache.md) : la frontière qu'ils tracent recule pour trois routes, et **seulement** pour ces trois-là.

## Context

L'[ADR 019](019-alignement-de-l-hote-d-api-pour-la-suite-e2e.md) a rendu
exécutables les 24 tests du lot le plus gros de l'épique de conformité. Le
verdict est passé de 21 verts sur 45 à 35, puis à 35 après correction de trois
défauts. Sur les 10 rouges restants, **7 partagent une seule cause**, et cette
cause n'est pas un défaut :

`page.route()` n'intercepte que le **navigateur**. Nos pages article, profil et
éditeur chargent pourtant leurs données pendant le rendu **serveur**
([ADR 012](012-rendu-hybride-et-session-client.md)). Quand la suite mocke un
article `test-article` et navigue vers `/article/test-article`, notre serveur
interroge l'API réelle, n'y trouve rien, et rend la coquille « article
introuvable ». Le test pilote ensuite un formulaire de commentaire, un bouton de
favori ou un lien d'édition qui n'existent pas dans cette coquille.

Aucune de ces sept assertions ne porte sur le contenu de l'article : elles
portent sur ce que le front fait d'une erreur d'API. Elles supposent seulement,
sans le dire, que la page se peuple **depuis le navigateur** — l'hypothèse
naturelle quand la référence RealWorld est une application monopage.

La spec RealWorld, elle, n'impose rien de tel : elle décrit un contrat HTTP et
des routes, pas un mode de rendu. Le choix du rendu serveur pour le contenu
public était le nôtre, motivé par l'indexation et le premier affichage.

## Options Considered

### A. Déclarer les 7 tests non applicables

Un ADR actant que la suite suppose un front entièrement client. Coût nul,
architecture préservée. Mais la liste des non-applicables passe de 0 à 7, elle
devra être relue à chaque montée de version de la suite, et le gate
([#17](https://github.com/kamangacode/conduit-fullstack/issues/17)) ne pourrait
plus viser zéro rouge — il partirait sur une base de référence, c'est-à-dire sur
un seuil qu'on s'accorde à soi-même.

### B. Charger ces trois pages depuis le navigateur

Les mocks s'appliquent alors partout, et les sept tests redeviennent des
informations sur le front. Le prix est réel et se paie sur deux plans : le
contenu public n'est plus dans le HTML initial (indexation, premier affichage),
et **une ressource absente répond désormais 200** avec une coquille, là où
`notFound()` produisait un vrai 404.

### C. Semer en base les entités que la suite mocke

`test-article`, `otheruser`, `blockeduser`… créés avant le run : les pages se
rendent depuis la vraie API, et les mutations — client — restent interceptées.
L'architecture ne bouge pas. Mais des fixtures devraient rester alignées sur le
contenu d'un fichier vendoré qu'on ne contrôle pas : une évolution amont les
désaligne en silence, et le symptôme ressemblerait à un défaut de conformité.

## Decision

**Option B**, sur trois routes et pas une de plus :

| Route | Avant | Après |
|---|---|---|
| `/article/:slug` | article et commentaires chargés au rendu serveur | chargés par le navigateur (TanStack Query) |
| `/profile/:username` (+ `/favorites`) | profil chargé au rendu serveur | profil chargé par le navigateur |
| `/editor/:slug` | article chargé au rendu serveur | article chargé par le navigateur |

Ce qui **ne bouge pas**, et l'énumérer est le seul moyen de garder l'ADR 012
lisible :

- L'accueil et les listes d'articles gardent leur préchargement serveur +
  hydratation ([ADR 015](015-prechargement-serveur-et-hydratation-du-cache.md)).
  C'est le chemin le plus visité du site, et aucun test ne dépend d'un mock sur
  ce trajet.
- La session reste hors du serveur, le jeton ne quitte pas le navigateur
  ([ADR 012](012-rendu-hybride-et-session-client.md)).
- Les appels serveur restants partent toujours **sans jeton** : la frontière du
  contrat (`following` et `favorited` relatifs au lecteur, règle R-5) est
  inchangée.

## Consequences

### Positive

- Les 7 tests deviennent exécutables : leurs échecs redeviennent des
  informations sur le front, ce qu'ils n'étaient pas.
- Un seul chemin de données pour ces trois pages, au lieu d'un chargement
  serveur doublé d'un rafraîchissement client. Les états « en cours » et « en
  échec » y deviennent explicites plutôt qu'implicites.
- Le gate e2e (#17) peut viser zéro rouge plutôt qu'une base de référence — un
  seuil qu'on ne s'accorde pas à soi-même.

### Negative

- **Le contenu de ces pages disparaît du HTML initial.** Un moteur d'indexation
  qui n'exécute pas JavaScript ne voit plus le corps d'un article. C'est la
  perte la plus lourde de cette décision, et elle est assumée : la spec
  RealWorld ne demande pas l'indexation, et ce dépôt n'a pas de trafic public à
  protéger.
- **Le statut HTTP d'une ressource absente devient 200.** `notFound()` ne peut
  pas être appelé depuis un composant client : la coquille « introuvable » est
  rendue, mais le serveur a déjà répondu. Trois exigences l'affirmaient
  (REQ-WEB-005 AC-6, REQ-WEB-012 AC-7, REQ-WEB-018) et sont amendées — pas
  contournées.
- Premier affichage plus tardif sur ces routes : un aller-retour supplémentaire
  avant que le contenu n'apparaisse.
- **Ces trois routes perdent la réparation implicite du cache par hydratation.**
  Conséquence non listée à la décision, découverte en mesurant
  ([#29](https://github.com/kamangacode/conduit-fullstack/issues/29)) et ajoutée
  ici par amendement. `hydrate` remplace une entrée dès que la donnée
  déshydratée est plus récente : tant que ces pages chargeaient au rendu
  serveur, chaque navigation vers elles écrasait le cache client avec ce que le
  serveur venait de lire, et une entrée périmée ne survivait pas à une
  navigation. L'accueil et les listes gardent cette réparation
  ([ADR 015](015-prechargement-serveur-et-hydratation-du-cache.md)) ; ces trois
  routes ne l'ont plus, et **le cache client y fait désormais autorité**. La
  règle qui en découle : **toute mutation qui touche une ressource affichée par
  ces routes doit écrire sa réponse dans le cache** — sans quoi
  `staleTime: 30_000` sert l'état d'avant et plus rien ne le corrige. Le premier
  symptôme constaté a été un article enregistré à titre inchangé, donc à slug
  inchangé, dont la page suivante affichait les étiquettes qu'on venait de
  retirer (REQ-WEB-014 AC-8 à AC-11). Un renommage y échappait par accident : le
  slug régénéré mène à une clé de cache vide, donc chargée depuis l'API.

### Neutral

- Les fichiers `not-found.tsx` et `error.tsx` posés par
  [REQ-WEB-018](../requirements/functional/web/REQ-WEB-018.md) restent en place
  pour les erreurs qui surviennent encore côté serveur (paramètres de route
  invalides, panne du rendu lui-même) ; les coquilles qu'ils rendent sont
  désormais partagées avec les états d'échec côté client.
- La décision se relit à l'envers sans difficulté : rétablir le chargement
  serveur revient à remettre un `await` dans trois pages, si le jour vient où
  l'indexation compte plus que ces sept tests.
