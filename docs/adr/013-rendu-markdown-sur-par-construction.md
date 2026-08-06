# ADR 013 — Rendu Markdown sûr par construction, sans assainissement à appeler

## Status

Accepted — 2026-08-05.

## Context

Le corps d'un article est du **Markdown fourni par l'utilisateur** (PRD §6), et
la spec de référence demande de le rendre côté client :

> *Render markdown from server client side*
> — `specifications/frontend/routing.md`

C'est la première surface de **XSS stocké** du dépôt. Jusqu'ici, tout ce que
`apps/web` affichait était du texte inséré par React, donc échappé par
construction : un `<script>` dans une bio s'affiche comme du texte. Rendre du
Markdown change cette propriété, parce que rendre du Markdown, c'est produire du
balisage.

Le risque n'est pas théorique et il est aggravé par le modèle de session retenu
en [ADR 012](012-rendu-hybride-et-session-client.md) : le jeton vit dans
`localStorage`, donc lisible par tout script exécuté dans la page. Un XSS stocké
dans un article ne défigurerait pas seulement l'affichage — il exfiltrerait la
session de chaque lecteur.

La décision porte donc moins sur « quelle bibliothèque Markdown » que sur **où
vit la sûreté** : dans une étape qu'on applique, ou dans une architecture qui
rend l'injection impossible.

## Options Considered

| Option | Trade-off |
|---|---|
| **A. `react-markdown` — sûr par construction (retenue)** | Le Markdown devient un **arbre d'éléments React**, jamais une chaîne HTML. Il n'y a donc pas de `dangerouslySetInnerHTML`, et rien à assainir : le HTML brut est ignoré par défaut. Coûte ~40 kB et l'impossibilité d'interpréter du HTML inline légitime — cas rare dans un Markdown Conduit. |
| B. `marked` + `DOMPurify` | Plus léger, supporte le HTML inline. Écartée pour une raison de mécanique, pas de qualité : la sûreté y dépend d'un **appel** — `sanitize` — qu'un contributeur peut déplacer, oublier ou court-circuiter, et dont l'omission **ne casse aucun test**. Elle introduirait aussi le premier `dangerouslySetInnerHTML` du dépôt, qui ferait précédent. |
| C. Rendu Markdown côté serveur (RSC + `rehype-sanitize`) | Zéro JavaScript de rendu envoyé au client et contenu indexable. Écartée : la spec dit explicitement « client side », et l'aperçu de l'éditeur exige de toute façon un rendu client — on entretiendrait deux chemins de rendu qu'il faudrait garder cohérents. |

## Decision

Le corps d'article est rendu par **`react-markdown`**, sans étape
d'assainissement, parce qu'il n'y a rien à assainir : la bibliothèque construit
des éléments React et n'expose jamais de chaîne HTML au DOM.

Cela pose une règle générale pour `apps/web` :

> **`dangerouslySetInnerHTML` n'est utilisé nulle part.** Son absence est
> vérifiable d'un `grep`, ce qu'un assainissement correctement appelé n'est pas.

Le HTML brut contenu dans le Markdown n'est pas interprété. C'est le comportement
par défaut de la bibliothèque, et il est conservé tel quel : activer
`rehype-raw` rouvrirait exactement le vecteur que cette décision ferme.

La même approche sert à l'aperçu de l'éditeur : un seul chemin de rendu, donc
aucun écart possible entre ce que l'auteur voit en écrivant et ce que le lecteur
verra.

## Consequences

### Positive

- L'injection n'est pas *filtrée*, elle est **impossible** : il n'existe pas de
  chemin par lequel une chaîne de l'article devienne du balisage.
- La propriété survit aux refactorings. Un contributeur qui déplace le rendu
  n'emporte pas avec lui une étape de sûreté qu'il pourrait perdre en route.
- Le contrôle de revue est trivial et mécanisable : `dangerouslySetInnerHTML`
  ne doit apparaître nulle part.
- Un seul chemin de rendu pour l'article et pour l'aperçu de l'éditeur.

### Negative

- ~40 kB de JavaScript supplémentaires sur la page article, là où `marked` seul
  serait plus léger. C'est le prix explicite de la propriété ci-dessus.
- Le HTML inline dans un article n'est pas rendu. Un auteur qui écrirait
  `<kbd>` obtiendrait le texte littéral. Le contrat RealWorld ne promet rien à ce
  sujet, et le front de référence ne l'exploite pas.
- La bibliothèque devient une dépendance de sécurité : une faille chez elle
  serait une faille ici. C'est vrai de `DOMPurify` aussi, à ceci près que la
  surface exposée est plus petite quand aucune chaîne HTML n'est produite.

### Neutral

- Le durcissement par en-têtes (CSP) reste prévu en Phase 5 (item B8). Il est
  complémentaire, pas redondant : la CSP couvre les vecteurs que le rendu
  Markdown ne contrôle pas.
- Si le besoin d'HTML inline apparaissait, la réponse serait `rehype-raw`
  **plus** un assainissement — c'est-à-dire l'option B, et cet ADR serait à
  amender explicitement plutôt qu'à contourner discrètement.
- Le jeton en `localStorage` reste le facteur qui rend un XSS coûteux ici ; c'est
  une conséquence de l'ADR 012, assumée là-bas, et cette décision en réduit la
  probabilité d'exploitation.
