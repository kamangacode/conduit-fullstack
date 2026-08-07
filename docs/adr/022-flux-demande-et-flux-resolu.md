# ADR 022 — Distinguer le flux demandé du flux résolu, et faire primer la suite vendorée sur les exigences

## Status

Accepted — 2026-08-07. Amende [012](012-rendu-hybride-et-session-client.md) sur
l'endroit où se décide l'accès au flux personnel, et précise
[018](018-conformite-e2e-suite-officielle-vendoree.md) sur l'arbitrage d'un
conflit entre une exigence du dépôt et la suite de conformité.

## Context

L'accueil (`/`, `/tag/:tag`) est rendue par un Server Component qui appelait
`resolveFeed({ tag, feedParam, isAuthenticated: false })`. Le `false` est exact —
l'[ADR 012](012-rendu-hybride-et-session-client.md) place la session hors du
serveur, donc le rendu serveur ne peut pas savoir qui lit. Mais son résultat
(`{ kind: 'global' }`) était ensuite traité comme le flux **final** : préchargé,
passé aux onglets, passé à la liste.

Trois conséquences observables, toutes sur `/?feed=following` :

- un lecteur connecté qui ouvre cette URL voit le flux **global**, avec l'onglet
  « Global Feed » actif ;
- un visiteur anonyme qui la suit n'est jamais renvoyé vers `/login` : il voit
  lui aussi le flux global ;
- une page de flux personnel n'est donc pas partageable — l'état qui la décrit ne
  vit pas entièrement dans l'URL.

La suite de conformité vendorée constate les trois
(`url-navigation.spec.ts:23,33`). Elle exige en outre que `/` affiche
« Global Feed » **actif** y compris pour un lecteur connecté
(`url-navigation.spec.ts:13`), et que `/?feed=following` **redirige** un anonyme
vers `/login` (`url-navigation.spec.ts:33`).

Or REQ-WEB-009 disait le contraire sur ces deux points : AC-2 annonçait
« Your Feed » actif par défaut pour un lecteur connecté, et AC-3 prescrivait un
repli silencieux vers le flux global pour un anonyme. Ces deux critères n'ont pas
été écrits par erreur — ils sont raisonnables pris isolément — mais ils ont été
écrits **avant** que la suite officielle soit vendorée, et personne n'a rejoué la
comparaison ensuite. Le dépôt se retrouve donc avec deux contrats qui divergent
et aucune règle écrite pour dire lequel gagne.

Deuxième force, indépendante : la garde ne peut pas être un middleware Next.
Aucun cookie, aucune session serveur (ADR 012) — le serveur n'a rien à lire pour
arbitrer `/?feed=following`. La garde est donc forcément cliente, ce qui la place
dans un composant qui doit distinguer quatre états de session
(`pending`, `anonymous`, `authenticated`, `unavailable`) et non deux.

## Options Considered

| Option | Trade-off |
|---|---|
| **A (retenue) — Le serveur transmet le flux *demandé*, un composant client le *résout*** | Le serveur ne précharge que ce qu'il peut légitimement charger (flux publics), et le composant client tranche sur `status`. Coûte un composant de plus dans l'arbre et deux allers-retours séquentiels (`GET /user` puis `GET /articles/feed`) avant que la liste personnelle n'apparaisse. |
| B — Middleware Next qui redirige `/?feed=following` | Impossible sans casser l'ADR 012 : le middleware n'a ni cookie ni session à lire. Le rendre possible exigerait de poser le jeton dans un cookie, c'est-à-dire de rouvrir la décision qui structure toute l'authentification du front. |
| C — Garder le repli silencieux vers le flux global (REQ-WEB-009 AC-3 d'origine) | Aucun code à écrire, mais la suite reste rouge et l'URL du flux personnel ne veut rien dire pour un anonyme : il croit voir son flux, il voit celui de tout le monde. |
| D — Rendre la liste dès que `user === null` est faux | Le piège déjà payé sur `/settings` : trois des quatre états ont `user === null`. Une garde écrite ainsi éjecte les lecteurs connectés pendant la réhydratation. |

Pour l'arbitrage du conflit :

| Option | Trade-off |
|---|---|
| **A (retenue) — La suite vendorée fait foi, la règle est écrite** | Un seul contrat opposable. Coûte la réécriture des critères concernés, et assume que la suite amont puisse imposer un comportement discutable. |
| B — Trancher au cas par cas | Rejoue le débat à chaque conflit, et rien ne garantit deux arbitrages cohérents à trois semaines d'écart. |

## Decision

**Le flux demandé et le flux résolu sont deux valeurs distinctes.**

- `requestedFeed({ tag, feedParam })` (dans `apps/web/src/lib/feed-query.ts`)
  lit l'**URL** seule et rend le flux demandé. Elle ne prend plus
  `isAuthenticated` : ce paramètre était l'endroit exact où les deux notions se
  confondaient.
- `isPublicFeed(feed)` dit ce que le serveur a le droit de précharger.
  `apps/web/src/app/home-page.tsx` ne précharge que sur cette condition —
  c'est déjà ce que prescrivait l'[ADR 015](015-prefetch-serveur-et-hydratation-des-listes.md)
  §4, désormais exprimé par une fonction plutôt que par une convention.
- `apps/web/src/components/HomeFeed.tsx` est le composant client de résolution.
  Il reçoit le flux demandé, lit `status`, et tranche.

**La garde s'écrit sur `status === 'anonymous'`, et sur lui seul.** Aucune autre
condition ne déclenche `router.replace('/login')`. En particulier :

- `pending` n'attend rien de plus qu'un rendu : ni redirection, ni requête
  authentifiée. Rediriger ici éjecterait un lecteur connecté pendant la fenêtre
  de réhydratation.
- `unavailable` (jeton conservé, API invérifiable — REQ-WEB-016) ne redirige pas
  non plus : un lecteur dont l'API est en rade n'est pas un anonyme, et l'envoyer
  au formulaire de connexion lui ferait tenter une action qui échouera aussi.

**La liste du flux personnel n'est montée qu'une fois `authenticated`.** Ce n'est
pas une précaution d'affichage : `api-client` prend le jeton dans la session, donc
monter `FeedList` avec `feed=following` avant la résolution émettrait un
`GET /articles/feed` anonyme, qui reviendrait en 401 et afficherait un échec là
où le lecteur attend sa liste. Pendant l'attente, l'écran porte `.feed-status` —
ni `.article-preview`, ni `.empty-feed-message`, que le contrat compte.

**L'onglet actif est désigné par l'URL, jamais par la session.** `FeedToggle`
reçoit le flux demandé : sur `/`, « Global Feed » est actif même pour un lecteur
connecté.

**Règle d'arbitrage, générale et opposable :** quand une exigence de
`docs/requirements/` et la suite de conformité vendorée divergent sur un
comportement observable, **c'est la suite qui fait foi**, et l'exigence est
amendée pour la suivre. L'ADR 018 avait fait de la suite le contrat sans dire ce
qui se passe quand le dépôt le contredit ; c'est cette phrase-là qui manquait.
REQ-WEB-009 AC-2 et AC-3 sont réécrits en conséquence.

## Consequences

### Positive

- Une URL de flux décrit entièrement ce qu'elle affiche : `/?feed=following` est
  partageable, et le bouton précédent redevient prévisible.
- Le préchargement serveur ne peut plus partir sur un flux qu'il n'a pas le droit
  de charger : la condition est une fonction, plus une vigilance.
- Les quatre états de session sont traités explicitement au même endroit, ce qui
  rend le cas `unavailable` testable plutôt que déduit.
- Le prochain conflit REQ / suite se tranche par lecture, pas par débat.

### Negative

- Deux allers-retours séquentiels (`GET /user` puis `GET /articles/feed`) avant
  qu'un flux personnel n'apparaisse, pour un budget de 2 s côté suite
  (`url-navigation.spec.ts:95`). C'est le point de fragilité temporelle du lot ;
  si la CI s'y montre instable, la cause est là — et le remède ne peut pas être
  d'assouplir la configuration Playwright (ADR 018).
- Un composant de plus entre la page et la liste, donc un niveau d'indirection
  supplémentaire à traverser pour comprendre d'où viennent les articles.
- La règle « la suite fait foi » nous engage à suivre l'amont même quand son
  choix est discutable. Le prix est assumé : un contrat qu'on amende à sa
  convenance n'est plus un contrat.

### Neutral

- `resolveFeed` disparaît, et `feed-query.spec.ts` change en conséquence. Ce
  n'est pas un dégât collatéral masqué : la fonction confondait précisément les
  deux notions que cet ADR sépare.
- Le contenu réel du flux personnel (suivre un compte) reste hors périmètre : il
  dépend de cette décision sans être traité ici.
- Aucune modification de `apps/api`. Le serveur d'API n'a jamais participé à
  cette confusion.
