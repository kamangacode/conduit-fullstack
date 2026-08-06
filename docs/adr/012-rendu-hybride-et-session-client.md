# ADR 012 — Rendu hybride et session portée par le client

## Status

Accepted — 2026-08-05.

## Context

Deux contraintes tirent `apps/web` dans des directions opposées.

**La spec RealWorld** décrit une authentification entièrement cliente : un JWT
obtenu par `POST /users/login`, conservé côté navigateur, renvoyé en
`Authorization: Token <jwt>` sur chaque requête (PRD §9). L'API est stateless —
elle ne pose aucun cookie et ne connaît aucune session. C'est le contrat que la
suite de conformité vérifie, et que les quatre autres implémentations de la
spine respectent.

**Next.js App Router** est construit autour des Server Components : le rendu par
défaut se fait sur le serveur, où `localStorage` n'existe pas. Une page qui a
besoin de savoir *qui* la consulte ne peut donc pas être rendue côté serveur
sans qu'on lui donne un autre moyen de le savoir.

S'ajoute une propriété du contrat qui interdit de trancher globalement : sur les
articles, `following` et `favorited` sont **relatifs au lecteur** (règle R-5), et
la même page a donc deux rendus légitimes. Le contenu lui-même — titre, corps,
auteur, nombre de favoris — est en revanche identique pour tout le monde.

La décision engage `apps/web` bien au-delà de la slice d'authentification : elle
fixe la forme de toutes les pages de F5 et F6.

## Options Considered

| Option | Trade-off |
|---|---|
| **A. Hybride — serveur pour le public, client pour le personnalisé (retenue)** | Les pages publiques sont rendues côté serveur **en anonyme** ; ce qui dépend du lecteur est hydraté côté client. Garde le référencement et un premier rendu utile sur le contenu, sans inventer de session serveur. Coûte deux chemins de données sur les mêmes pages, et un bref état « non connecté » avant hydratation. |
| B. Tout client | Chaque page consommant l'API devient un Client Component ; le jeton vit en `localStorage` et nulle part ailleurs. C'est l'architecture des implémentations RealWorld de référence, la plus simple et la plus comparable. Prix : aucun référencement, un HTML initial vide, et Next.js réduit à un routeur — un framework choisi pour des capacités qu'on n'utiliserait pas. |
| C. Miroir du jeton dans un cookie `httpOnly` | Permet aux Server Components de rendre des pages déjà authentifiées, donc le meilleur premier rendu. Écartée : deux copies du même secret à garder synchrones, une déconnexion qui en oublie une laisse une session fantôme, et le mécanisme est absent du contrat que la conformité vérifie. |

## Decision

**Option A.** La frontière suit celle du contrat : ce qui est identique pour tous
est rendu côté serveur, ce qui dépend du lecteur est résolu côté client.

- **Server Components** : les pages dont le contenu est public — flux global,
  article, profil, liste de tags. Elles appellent l'API **sans jeton**, donc en
  anonyme, et reçoivent `following: false` / `favorited: false`, qui est
  exactement ce que R-5 prescrit pour un lecteur non identifié.
- **Client Components** : les fragments qui dépendent du lecteur (barre de
  navigation, boutons suivre et favori, actions d'auteur) et les pages
  intégralement personnelles ou interactives — connexion, inscription,
  paramètres, éditeur, flux personnel.
- **Le jeton ne quitte jamais le navigateur.** Il est écrit dans
  `localStorage` à la connexion, lu une fois au démarrage pour réhydrater la
  session, et injecté par `api-client.ts` sur les seules requêtes clientes.

La session est portée par un **contexte React**, pas par une bibliothèque
d'état. Elle tient en deux valeurs — le jeton et le `User` courant — posées une
fois et rarement modifiées : c'est précisément le cas d'usage d'un contexte, et
un store externe n'apporterait ici qu'une dépendance. **TanStack Query** est en
revanche ajouté pour l'état *serveur* (cache, déduplication, invalidation après
mutation), où il résout un vrai problème.

Cette décision **amende la rule 10** sur un point : Zustand y était présenté
comme un prérequis de l'état UI client. Il n'est pas installé, et ne le sera que
lorsqu'un état UI réel le justifiera — le brouillon de l'éditeur d'article (F5)
est le premier candidat crédible.

## Consequences

### Positive

- Le contrat est respecté à la lettre : aucune session serveur, aucun cookie,
  l'API reste stateless et la suite de conformité reste applicable.
- Les pages de contenu sont référençables et affichent quelque chose d'utile
  avant toute exécution de JavaScript.
- La frontière serveur/client n'est pas une convention arbitraire : elle recopie
  une distinction que le contrat fait déjà (ce qui dépend du lecteur, R-5).
- Une seule dépendance ajoutée, et pour un problème qu'elle résout réellement.

### Negative

- **Deux chemins de données coexistent sur une même page** : un appel serveur
  anonyme et des appels clients authentifiés. C'est le vrai coût de cette
  décision, et il se paie en lisibilité — il faut savoir, pour chaque composant,
  de quel côté il vit.
- Un bref état « non connecté » précède l'hydratation : la barre de navigation
  affiche les liens anonymes avant de basculer. Atténuable, jamais totalement
  supprimable sans la session serveur qu'on refuse.
- Le jeton en `localStorage` reste lisible par tout script exécuté dans la page.
  C'est le modèle imposé par le contrat ; le durcissement possible est côté
  en-têtes (CSP), prévu en Phase 5 (item B8), pas côté stockage.

### Neutral

- Rien n'interdit d'ajouter Zustand plus tard : la décision porte sur « pas
  maintenant », pas sur « jamais ».
- Le flux personnel (`/feed`) est nécessairement client : il n'a pas de rendu
  anonyme concevable (R-4). Ce n'est pas une exception à la règle, c'est la règle
  appliquée.
- Si le référencement cessait d'être un objectif, l'option B redeviendrait
  défendable et cet ADR serait à réexaminer — c'est la seule hypothèse qui le
  soutient vraiment.
