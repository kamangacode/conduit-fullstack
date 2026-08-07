---
id: REQ-WEB-009
title: Présenter la page d'accueil avec ses onglets de flux et ses tags populaires
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (routes) et §7.3 ; templates.md §Home ; contrat de sélecteurs E2E (routes `/`, `/?feed=following`, `/tag/:tag`)"
acceptance_criteria:
  - id: AC-1
    given: "un visiteur anonyme sur la page d'accueil"
    when: "la page s'affiche"
    then: "seul l'onglet « Global Feed » est proposé, et il est marqué actif"
  - id: AC-2
    given: "un utilisateur connecté sur la page d'accueil"
    when: "la page s'affiche"
    then: "l'onglet « Your Feed » apparaît en plus de « Global Feed », et c'est « Global Feed » qui porte la classe `active` — l'onglet actif est désigné par l'URL, jamais par la session"
  - id: AC-3
    given: "un visiteur anonyme qui atteint le flux personnel par l'URL `/?feed=following`"
    when: "la page se rend"
    then: "le navigateur se retrouve sur `/login`, et aucune requête `GET /articles/feed` n'a été émise"
  - id: AC-4
    given: "la liste des tags populaires"
    when: "un tag est choisi"
    then: "un troisième onglet portant ce tag apparaît et devient actif, sans faire disparaître les deux autres"
  - id: AC-5
    given: "un flux qui ne contient aucun article"
    when: "la page s'affiche"
    then: "elle rend le message d'absence du contrat plutôt qu'une liste vide muette"
  - id: AC-6
    given: "la barre latérale des tags"
    when: "l'API des tags échoue ou n'en renvoie aucun"
    then: "la page reste utilisable et le flux s'affiche — la barre latérale ne fait pas échouer la page"
  - id: AC-7
    given: "un lecteur connecté qui ouvre `/?feed=following` directement"
    when: "la session est résolue"
    then: "l'onglet « Your Feed » porte la classe `active` et la liste provient de `GET /articles/feed`, jamais d'un filtre de `GET /articles`"
  - id: AC-8
    given: "un lecteur connecté dont le flux personnel ne renvoie aucun article"
    when: "la liste est chargée"
    then: "`.empty-feed-message` contient « Your feed is empty » et un lien `a[href=\"/\"]`"
  - id: AC-9
    given: "un flux public (global ou tag) sans article"
    when: "la liste est chargée"
    then: "`.empty-feed-message` rend le message d'absence générique et ne mentionne pas de flux personnel"
  - id: AC-10
    given: "une session dans l'état `pending` sur `/?feed=following`"
    when: "le premier rendu a lieu"
    then: "aucune redirection n'est déclenchée et aucune requête authentifiée n'est émise"
  - id: AC-11
    given: "une session dans l'état `unavailable` sur `/?feed=following`"
    when: "la page se rend"
    then: "le lecteur n'est pas redirigé vers `/login` et aucun appel authentifié n'est émis"
  - id: AC-12
    given: "un lecteur connecté sur `/`"
    when: "il active l'onglet « Your Feed », puis « Global Feed » depuis `/?feed=following`"
    then: "l'URL devient exactement `/?feed=following`, puis exactement `/`"
implementation:
  files:
    - apps/web/src/lib/feed-query.ts
    - apps/web/src/components/FeedToggle.tsx
    - apps/web/src/components/FeedList.tsx
    - apps/web/src/components/HomeFeed.tsx
    - apps/web/src/components/PopularTags.tsx
    - apps/web/src/app/home-page.tsx
    - apps/web/src/app/page.tsx
    - "apps/web/src/app/tag/[tag]/page.tsx"
  tests:
    - apps/web/src/lib/feed-query.spec.ts
    - apps/web/src/components/FeedToggle.spec.tsx
    - apps/web/src/components/FeedList.spec.tsx
    - apps/web/src/components/HomeFeed.spec.tsx
    - apps/web/src/components/PopularTags.spec.tsx
related:
  issues: [8, 13]
  requirements:
    - REQ-WEB-008
    - REQ-WEB-010
    - REQ-WEB-011
    - REQ-WEB-016
    - REQ-TAG-001
  adrs:
    - "012"
    - "015"
    - "022"
---

# REQ-WEB-009 — Présenter la page d'accueil avec ses onglets de flux et ses tags populaires

## Contexte

La page d'accueil est la seule du parcours à composer **trois sources** : le flux
global, le flux personnel et les tags populaires. C'est aussi la première page
où la frontière serveur/client de l'[ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)
se joue sur du contenu de liste et non sur un fragment isolé.

AC-3 est le critère qu'une implémentation plausible oublie. Les onglets sont
conditionnés à la session, donc « Your Feed » n'est pas affiché à un anonyme — et
on en conclut trop vite que le flux personnel est inatteignable. Il l'est par
l'URL, que le contrat de sélecteurs E2E rend explicite (`/?feed=following`). Sans
garde, un visiteur anonyme qui la suit déclenche un appel authentifié sans jeton,
reçoit un 401, et voit une page en erreur.

**AC-2 et AC-3 sont amendés** ([ADR 022](../../../adr/022-flux-demande-et-flux-resolu.md)).
Leur première rédaction prescrivait « Your Feed » actif par défaut et un repli
silencieux vers le flux global ; la suite de conformité vendorée exige
« Global Feed » actif sur `/` et une redirection vers `/login`
(`url-navigation.spec.ts:13,33`). Quand une exigence de ce dépôt et la suite
vendorée divergent, **c'est la suite qui fait foi** — règle générale posée par
l'ADR 022, dans le prolongement de l'ADR 018 qui avait fait de la suite le
contrat. Le repli était d'ailleurs le plus trompeur des deux comportements : un
anonyme croyait voir son flux là où on lui montrait celui de tout le monde.

AC-10 et AC-11 tiennent à un piège de la session (ADR 012, ADR 014) : trois de
ses quatre états portent `user === null` (`pending`, `anonymous`, `unavailable`).
Une garde écrite sur cette condition éjecte les lecteurs connectés pendant la
réhydratation — le défaut déjà payé une fois sur `/settings`. Elle s'écrit sur
`status === 'anonymous'`, et seulement sur lui.

AC-6 tient à la nature de la barre latérale : elle est **décorative pour le
parcours**. Un échec de `GET /tags` ne doit pas empêcher de lire les articles,
alors qu'un appel non isolé le ferait — c'est le genre de couplage qu'on ne
remarque pas tant que l'API répond.

## Règles

- Le flux personnel passe par l'endpoint dédié, jamais par un filtre de la liste
  globale ([REQ-WEB-008](REQ-WEB-008.md) AC-4).
- Le flux **demandé** (lu dans l'URL, connu du serveur) et le flux **résolu**
  (qui dépend de la session, connu après montage) sont deux valeurs distinctes.
  Le serveur ne précharge qu'un flux public ; la garde du flux personnel est
  cliente, faute de quoi que ce soit à lire côté serveur (ADR 012, ADR 022).
- La liste du flux personnel n'est montée qu'une fois la session
  `authenticated` : la monter plus tôt émettrait un `GET /articles/feed` sans
  jeton.
- Un écran d'attente ne porte ni `.article-preview` ni `.empty-feed-message` —
  le contrat compte la première et attend la seconde comme une liste vide.
- L'onglet actif porte la classe `active` du template — le CSS de référence s'en
  sert pour marquer la position, et son absence rend la navigation illisible sans
  rien casser d'autre.
- Le markup suit `templates.md` §Home : `.home-page`, `.banner`, `.feed-toggle`,
  `.sidebar`, `.tag-list` (rule 11).
- L'état du flux courant vit dans l'**URL**, pas dans un état local : c'est ce
  qui rend une page de flux partageable et ce que le contrat E2E décrit.

## Hors périmètre

- La pagination, couverte par [REQ-WEB-010](REQ-WEB-010.md).
- Le rendu d'un aperçu d'article et la bascule de favori, couverts par
  [REQ-WEB-011](REQ-WEB-011.md).
- La page d'un tag comme route propre (`/tag/:tag`) : elle réutilise la même
  composition et n'ajoute pas de comportement, elle est traitée avec cette
  exigence.
