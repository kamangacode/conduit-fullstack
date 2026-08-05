# ADR 015 — Listes publiques : préchargement serveur et hydratation du cache client

## Status

Accepted — 2026-08-05. Précise l'[ADR 012](012-rendu-hybride-et-session-client.md).

## Context

La page d'accueil est la première à composer une **liste** — et elle met en
tension deux exigences que rien n'avait encore opposées.

L'[ADR 012](012-rendu-hybride-et-session-client.md) range le flux global parmi
les contenus publics, donc rendus côté serveur : c'est ce qui rend la page
lisible sans JavaScript, indexable, et immédiate sur un réseau lent. L'issue
fonctionnelle, elle, demande explicitement un *data fetching* via **TanStack
Query** — dont le fournisseur est câblé depuis F4 et n'a jamais servi.

Les deux ne se contredisent qu'en apparence, mais l'apparence suffit à produire
deux implémentations incompatibles selon l'ordre dans lequel on lit les
documents. D'où cette décision.

Le flux **personnel** (`?feed=following`) ne pose pas de question : le serveur
n'a pas le jeton (ADR 012 l'a placé hors du serveur), donc il ne peut pas le
charger. Il sera client quoi qu'il arrive. La question ne porte que sur le flux
**global**, et par extension sur toutes les listes publiques à venir — page d'un
tag, onglets du profil.

## Options Considered

| Option | Trade-off |
|---|---|
| **A. Préchargement serveur puis hydratation du cache (retenue)** | Le Server Component précharge la liste et transmet le cache **déshydraté** ; le composant client monte avec ce cache déjà rempli, donc `useQuery` ne déclenche aucune requête au chargement. Le HTML initial est complet, et TanStack reprend la main pour la suite — pagination, bascules de favori, flux personnel. Coûte le câblage `dehydrate` / `HydrationBoundary` et l'obligation de partager la clé de requête entre les deux côtés. |
| B. Toute la section flux côté client | Un seul chemin, le plus court à écrire. Écartée : le premier rendu ne contient plus que le squelette, ce que l'ADR 012 avait explicitement voulu éviter pour du contenu public. On paierait un aller-retour réseau après hydratation pour afficher ce que le serveur savait déjà. |
| C. Flux global en rendu serveur pur, TanStack réservé au flux personnel | Fidèle à l'ADR 012 sans amendement. Écartée pour une raison de mécanique : **deux implémentations de la même liste**, l'une serveur, l'autre cliente, à garder cohérentes à chaque évolution du markup ou du tri. C'est le motif de dérive parallèle que la revue du contrat de sélecteurs vient précisément de relever ailleurs dans le dépôt. |

## Decision

Les listes **publiques** sont préchargées côté serveur et servies au client via
un cache hydraté.

1. Le Server Component crée un `QueryClient` **par requête**, précharge la liste
   avec la même clé que le composant client, et enveloppe l'arbre dans un
   `HydrationBoundary`.
2. Le composant client interroge `useQuery` avec cette clé. Le cache étant déjà
   rempli, il n'émet **aucune requête** au chargement initial.
3. La **clé de requête et la fonction de récupération sont écrites une fois** et
   importées des deux côtés. Une clé recopiée qui diverge d'un caractère
   produirait un cache manqué — donc un rechargement silencieux, symptôme qui ne
   désigne pas sa cause.
4. Le flux **personnel** n'est jamais préchargé : le serveur est anonyme, un
   préchargement ne pourrait que renvoyer 401 ou, pire, le flux d'un autre.

Le `QueryClient` du serveur est créé **par requête** et jamais partagé : une
instance de module ferait fuiter le cache d'un visiteur vers le suivant. C'est
la même précaution que celle déjà prise côté client pour le `QueryClient` de
l'arbre React.

## Consequences

### Positive

- La page d'accueil reste ce que l'ADR 012 voulait : du contenu public complet
  dans le HTML initial, sans dépendre de l'exécution de JavaScript.
- Une seule implémentation de liste, un seul markup, un seul chemin de données —
  l'écueil de l'option C est fermé par construction.
- Aucune requête au chargement : le client démarre avec les données que le
  serveur a déjà obtenues, là où un `useQuery` nu en émettrait une aussitôt.
- TanStack Query sert enfin à ce pour quoi il est là : cache, déduplication,
  invalidation après mutation — sur les interactions, pas sur le premier rendu.

### Negative

- Le préchargement rend la page d'accueil dépendante de l'API **au rendu** :
  une API lente ralentit le serveur au lieu de dégrader seulement le client.
- Deux endroits doivent s'accorder sur la clé de requête. Le risque est réel et
  n'est fermé que par le partage du module — pas par le compilateur.
- Le poids transmis augmente : les données de la liste voyagent une fois dans le
  HTML, une fois dans le cache déshydraté.

### Neutral

- Cette décision **précise** l'ADR 012, elle ne l'amende pas : la frontière reste
  « public au serveur, relatif au lecteur au client ». Elle dit seulement
  comment le résultat du serveur parvient au cache client.
- Elle s'appliquera telle quelle aux autres listes publiques (page d'un tag,
  onglets du profil) et à la page article.
- Le rafraîchissement au focus reste désactivé (configuration posée en F4) : le
  contenu Conduit change peu à l'échelle d'une navigation, et un refetch
  systématique produirait surtout du bruit réseau.
