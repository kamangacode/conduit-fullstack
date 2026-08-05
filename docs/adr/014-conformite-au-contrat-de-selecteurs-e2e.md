# ADR 014 — Conformité au contrat de sélecteurs E2E : jeton seul persisté, session réhydratée par l'API

## Status

Accepted — 2026-08-05.

## Context

La suite Playwright officielle de RealWorld est partagée par toutes les
implémentations : c'est elle qui prouve qu'un front est un clone crédible, comme
la suite Hurl le prouve pour l'API. Elle est prévue en item F7.

Elle n'est pas exécutable contre n'importe quel markup. Elle repose sur un
**contrat de sélecteurs** (`specs/e2e/SELECTORS.md` du dépôt de référence, cité
par `specifications/frontend/tests.md`) qui fixe, entre autres :

- les attributs `name` des champs de formulaire ;
- les classes CSS et les textes de boutons ;
- l'URL de l'avatar par défaut quand `image` est absent ;
- la **clé `localStorage` du jeton : `jwtToken`, de valeur « JWT string »** ;
- une interface de débogage `window.__conduit_debug__` exposant `getToken()`,
  `getAuthState()` et `getCurrentUser()`.

Deux de ces points entrent en conflit avec ce que l'[ADR 012](012-rendu-hybride-et-session-client.md)
a mis en place, et c'est ce conflit que cette décision tranche.

Le premier est le stockage. La session écrit aujourd'hui le `User` complet en
JSON sous la clé `conduit.session`. C'est commode — le démarrage ne coûte aucune
requête — mais ce n'est ni la clé ni la valeur que le contrat décrit. Un test qui
lit le jeton pour forger une requête récupérerait un objet.

Le second est l'interface de débogage, qu'aucun code applicatif n'utilise et que
le contrat rend pourtant obligatoire.

Le point important est que **le contrat externe n'est pas négociable ici**. C'est
la même position que pour l'API : la spec RealWorld fait autorité, et une
implémentation qui s'en écarte « pour faire mieux » n'est plus comparable aux
autres. La question n'est donc pas *si* on s'aligne, mais *comment*, puisque
persister le seul jeton signifie que le compte courant doit venir d'ailleurs.

## Options Considered

Sur le stockage de la session :

| Option | Trade-off |
|---|---|
| **A. `jwtToken` seul, compte réhydraté par `GET /user` (retenue)** | Une seule clé, conforme au mot près, et une seule source de vérité pour le compte : l'API. Un profil modifié depuis un autre onglet ou une autre machine n'est jamais servi périmé. Coûte une requête au démarrage et rend l'état « en cours de résolution » réel plutôt que instantané — état que le contrat de débogage nomme déjà `loading`. |
| B. Deux clés : `conduit.session` (le `User`) + `jwtToken` (miroir du jeton) | Aucune requête au démarrage. Écartée pour une raison de mécanique : deux écritures à tenir synchronisées à chaque connexion, déconnexion et mise à jour des paramètres. Une désynchronisation ne casse rien visuellement — l'interface lit `conduit.session` — et ne se manifesterait qu'en E2E, c'est-à-dire loin de sa cause. |
| C. Le `User` complet sous la clé `jwtToken` | Une seule clé, aucune requête. Écartée : la valeur n'est pas un JWT, donc le contrat est respecté à la lettre du nom et trahi sur le contenu. C'est la pire des trois, parce qu'elle *paraît* conforme. |

Sur l'interface de débogage :

| Option | Trade-off |
|---|---|
| **A. Toujours exposée (retenue)** | Ce que fait l'implémentation Angular de référence. La suite E2E tourne contre n'importe quel build, y compris celui qu'on déploie. Ne divulgue rien de neuf : tout ce qu'elle rend est déjà lisible dans `localStorage` par le JavaScript de la même origine. |
| B. Conditionnée à `NEXT_PUBLIC_CONDUIT_DEBUG` | La production reste nue. Écartée : la conformité ne serait alors vérifiée que sur un build dédié. Le jour où la variable manque en CI, la suite échoue sur un symptôme trompeur — « interface absente » — au lieu d'un vrai défaut. |

## Decision

`apps/web` se conforme au contrat de sélecteurs E2E. En particulier :

1. **Le jeton est la seule chose persistée**, sous la clé `jwtToken`, avec pour
   valeur la chaîne JWT et rien d'autre.
2. **Le compte courant est réhydraté par `GET /user`** au démarrage, quand un
   jeton est présent. Tant que cet appel n'a pas répondu, la session est dans
   l'état « en cours de résolution » que les pages interrogeaient déjà avant de
   rediriger.
3. La réponse de l'API à cette réhydratation est **autoritaire dans un seul
   sens** : un **401** purge le jeton (il est refusé, le garder n'aide personne),
   mais une **panne réseau ne déconnecte pas** — le jeton est conservé et la
   visite se poursuit en anonyme, un rechargement réessaie. Purger sur une API
   momentanément injoignable transformerait une coupure de trente secondes en
   déconnexion de tous les visiteurs.
4. **`window.__conduit_debug__` est exposée en permanence**, en lecture seule.
   Les trois états qu'elle rapporte sont ceux du contrat : `loading`,
   `authenticated`, `unauthenticated`.
5. Quand `image` est absent, les avatars pointent vers `/default-avatar.svg`,
   **vendoré** dans `public/` comme l'est déjà le thème.

## Consequences

### Positive

- La suite E2E officielle devient exécutable sans adaptation locale — c'est tout
  l'intérêt d'une suite partagée, et l'item F7 n'aura pas à négocier avec le
  markup existant.
- Le compte affiché ne peut plus être périmé : il vient de l'API à chaque
  démarrage, là où une copie persistée survivait indéfiniment à une modification
  faite ailleurs.
- Le stockage ne contient plus l'email ni la bio de l'utilisateur. La surface
  exposée à un script tiers se réduit au jeton, qui était de toute façon le seul
  élément sensible.

### Negative

- Un aller-retour réseau au démarrage de chaque visite authentifiée. L'état
  transitoire de la barre de navigation, déjà assumé par l'ADR 012, dure
  désormais le temps d'une requête au lieu d'un rendu.
- `window.__conduit_debug__` est présente en production. Elle ne rend accessible
  que ce que `localStorage` rendait déjà accessible au même script, mais elle le
  rend *commode*, et c'est un point à réexaminer si une CSP stricte arrive
  (item B8, Phase 5).
- Le contrat de sélecteurs devient une contrainte de conception permanente :
  renommer une classe ou un attribut `name` « pour faire propre » casse une suite
  de tests qu'on ne maintient pas. C'est le prix d'être comparable, et la rule 11
  l'imposait déjà pour le markup.

### Neutral

- La bascule rend l'état `loading` réellement observable, alors qu'il était
  jusqu'ici quasi instantané. Les pages qui redirigent le consultaient déjà —
  c'est la distinction introduite par l'ADR 012, qui avait coûté un défaut.
- L'ancienne clé `conduit.session` n'est pas migrée : un visiteur qui en possède
  une repart simplement anonyme. Écrire un chemin de migration pour un dépôt
  jamais déployé serait du code mort à entretenir.
- La suite Playwright elle-même reste hors périmètre de cette décision : elle
  arrive en F7, et cet ADR ne fait que rendre son exécution possible.
