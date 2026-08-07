# ADR 018 — Conformité e2e du front : suite Playwright officielle vendorée, en rapport avant d'être un gate

## Status

Accepted — 2026-08-06. Étend l'[ADR 016](016-suite-de-conformite-vendoree.md) au
front sans l'amender : même invariant (la suite ne s'édite pas), autorité
différente (rapport, pas gate).

## Context

Le PRD §15.3 assigne à ce dépôt deux suites de conformité, pas une : « Hurl au
vert sur l'API **+ e2e Playwright sur le front** ». La première est en place
depuis F7a. La seconde est l'objet de cet ADR.

L'amont publie cette suite au même endroit et au même commit que la suite Hurl
(`realworld-apps/realworld`, `specs/e2e/`, SHA `450bbc5`) : 12 fichiers de specs,
8 helpers, un `playwright.base.ts` explicitement conçu pour être étendu, et le
`SELECTORS.md` auquel [l'ADR 014](014-conformite-au-contrat-de-selecteurs-e2e.md)
a déjà conformé le front en F4b. Le dépôt a donc déjà payé le prix d'entrée : les
`name` d'input, les classes CSS, la clé `jwtToken`, l'interface
`window.__conduit_debug__` et l'avatar par défaut sont en place parce que ce
contrat les demandait.

Deux tensions à trancher.

**La première est la même qu'en F7a, et elle a la même réponse.** Le cadre local
(rule 13) et l'item C2 du plan d'outillage décrivent une suite e2e **maison**,
en Page Object Model, sous `apps/web/e2e/`. Écrire cette suite reviendrait à
prouver que le front fait ce que nous avons dit qu'il ferait. La suite amont
prouve qu'il fait ce que la spec dit. L'écart entre les deux n'est pas
théorique : côté API, il valait 29 assertions à la première exécution, sur des
chemins que toutes nos suites déclaraient couverts.

**La seconde est nouvelle et tient au médium.** La suite Hurl parle HTTP : une
requête, une réponse, un verdict. La suite Playwright pilote un navigateur réel à
travers l'hydratation de Next.js, des redirections client, des attentes de
navigation. Ses modes d'échec incluent des situations qui ne disent rien de la
conformité — un `waitForURL` qui expire parce que le runner était chargé, une
assertion évaluée avant qu'un effet ait tourné. Un gate qui rougit pour ces
raisons-là est un gate qu'on désactive, et il emporte alors dans sa chute les
échecs qui, eux, disaient quelque chose.

## Options Considered

| Option | Trade-off |
|---|---|
| **A — Suite officielle vendorée, rapport d'abord (retenue)** | Le verdict de conformité front porte sur des assertions que nous n'avons pas écrites, comme côté API. Le job tourne et remonte son signal sans bloquer, le temps de mesurer le bruit réel sur quelques runs (rule 21, étape 3), puis bascule en gate dans un commit dédié avec un seuil qui a fait ses preuves. Coût : une période où un échec réel peut passer inaperçu si personne ne lit le job. |
| B — Suite maison en Page Object Model (rule 13, item C2) | Conforme à la lettre du plan et du cadre local, et le POM rend la suite lisible. Écartée : la conformité du front reposerait sur notre propre lecture de la spec, exactement ce que l'ADR 016 refuse côté API. Le dépôt affirmerait sa conformité front sans être en position de la contredire. |
| C — Les deux suites | Couverture maximale. Écartée : les deux suites parcourraient les mêmes écrans avec les mêmes assertions, et la maison n'apporterait rien que l'officielle ne prouve déjà. Deux machineries Playwright à maintenir pour un recouvrement quasi total. |
| D — Officielle vendorée, gate d'emblée | Cohérent avec le job `Conformance` de l'API. Écartée pour le motif du médium exposé ci-dessus : on ne connaît pas encore le taux de flake de cette suite contre ce front, et poser le gate avant de le mesurer, c'est choisir un seuil au jour 1 plutôt qu'après quelques itérations. |

## Decision

La suite officielle est **copiée telle quelle** sous `apps/web/conformance/e2e/`,
épinglée au commit amont `450bbc5410c7c1b7feca0f238e002162468e2a6c`, enregistré
dans `apps/web/conformance/UPSTREAM.md`. **Les fichiers ne sont jamais édités** :
l'invariant de l'ADR 016 s'applique mot pour mot, une assertion qui échoue est un
défaut du front.

Ce que ce dépôt écrit, et qui reste donc **hors** du dossier vendoré :

- `apps/web/playwright.config.ts`, qui étend `playwright.base.ts` amont en lui
  fournissant `baseURL` et le `testDir` — c'est le point d'extension que l'amont
  documente lui-même ;
- `scripts/test-e2e.sh`, qui compose la base, l'API et le front avant de lancer
  la suite.

**Le contrôle de dérive devient bi-suite.** `check-conformance-drift.sh` prend
désormais une clé de suite (`api` ou `web`) et traite les deux avec le même code.
Ce passage impose un changement qui n'est pas cosmétique : la suite e2e a un
sous-dossier `helpers/`, là où la suite Hurl est plate. Un lister à plat
rapporterait « ok » pendant que `helpers/auth.ts` — le fichier qui définit
comment on s'inscrit et se connecte, donc celui dont la retouche rendrait le plus
de tests verts — aurait été réécrit. Le listing passe donc par l'arbre git
récursif de l'amont, et `verify-conformance-drift.sh` gagne un mode qui abîme un
fichier **imbriqué** pour constater que le contrôle le voit.

**L'exécution est un rapport, pas un gate.** Le job CI `E2E` est en
`continue-on-error` et n'entre pas dans `ci-success`. Le passage en gate est un
geste ultérieur et délibéré, tracé comme item restant du plan.

#### Second temps — bascule en gate, 2026-08-07

Le geste annoncé ci-dessus a été fait, et il est daté ici plutôt que porté par un
nouvel ADR : il n'amende pas la décision, il en exécute la seconde moitié. Ce
paragraphe ne remplace donc pas le précédent — c'est l'écart entre les deux dates
qui porte l'information (convention d'amendement : [README.md](README.md)).

Ce qui l'a rendu possible, dans l'ordre : l'epic #11 a rendu la suite verte
(139/139), puis **trois runs verts consécutifs** sur `staging` ont mesuré le taux
d'instables sur une suite qui *passe* — le seul régime où ce taux veut dire
quelque chose. Le troisième a été déclenché à la main sur un arbre inchangé, pour
ne pas confondre « la suite est stable » et « le dernier commit était inoffensif ».
Mesure de la phase de rapport : **1 à 2 instables sur 139**, absorbés par les
`retries: 2` de la configuration amont, et un ensemble d'échecs strictement
identique d'un run à l'autre.

Concrètement : plus de `continue-on-error` sur les étapes du job, et `e2e` entre
dans le `needs` **et** dans la liste blanche de `ci-success`. Les trois maillons
comptent et aucun ne suffit seul — d'où
[`scripts/check-e2e-gate-wiring.mjs`](../../scripts/check-e2e-gate-wiring.mjs),
qui les vérifie à chaque changement de `ci.yml`. Le mode de panne qu'il ferme
n'est pas hypothétique : le 2026-08-07, un run **vert** portait une régression de
35 tests, invisible parce qu'un job en `continue-on-error` conclut `success` quoi
qu'il arrive (`artifacts/lessons.md`). C'était le coût assumé du rapport ; il ne
l'est plus.

Ce que la bascule ne change **pas** : le chiffre `retries: 2` n'est pas relevé
pour l'occasion. Le remonter ferait passer par la configuration ce qui doit
passer par le code (rule 13) — un gate vert acheté en silence plutôt qu'en
conformité.

### La conséquence sur la rule 13, écrite ici plutôt que découverte plus tard

La rule 13 prescrit le Page Object Model et un `packages/playwright-config`
partagé. Ces prescriptions gouvernent une suite **que nous écrivons**. Nous n'en
écrivons pas : il n'y a donc ni POM ni paquet de config partagée, et ce n'est pas
un manquement mais l'application de la présente décision. La rule est amendée en
ce sens, et l'item C2 du plan d'outillage est absorbé par F7b.

Si un parcours propre à ce dépôt — non couvert par la spec RealWorld — devait un
jour être testé en e2e, il vivrait sous `apps/web/e2e/` et suivrait alors le POM.
La distinction est entre *conformité* (assertions d'un tiers, jamais éditées) et
*régression* (assertions de nous, structurées par le POM).

## Consequences

### Positive

- Le front est confronté à 12 fichiers d'assertions qu'aucun contributeur de ce
  dépôt n'a écrites, sur des chemins que nos 209 tests web déclarent couverts.
  C'est la même asymétrie qui a rendu F7a utile.
- Le contrôle de dérive couvre désormais les deux suites par un seul chemin de
  code, et sa capacité à voir un fichier imbriqué est constatée plutôt
  qu'espérée.
- Les trois critères de F4 confiés à Playwright faute d'être testables en
  composant (comportements de page) sont enfin **exercés**. Écrire ici qu'ils
  « trouvent leur preuve » serait présumer du verdict : c'est le premier run qui
  le rend, et il a rendu **89 verts sur 139, donc 50 échecs**. La distinction
  n'est pas de la prudence rédactionnelle — c'est exactement
  l'affirmation-sans-observation que `artifacts/lessons.md` consigne au sujet de
  F7a.
- Le contrat de sélecteurs posé en F4b cesse d'être une conformité déclarative :
  la suite qui l'exige l'exécute.

### Negative

- Un échec réel peut passer inaperçu tant que le job ne bloque pas. C'est le prix
  assumé de la calibration, et il est borné : l'item de bump en gate est inscrit
  au plan, pas laissé à la mémoire. **Payé une fois, le 2026-08-07** — un run
  vert portant 35 tests rouges — puis clos par la bascule décrite ci-dessus. La
  borne a donc tenu, mais elle a coûté ce qu'elle annonçait.
- La machinerie d'exécution est plus lourde que celle de Hurl — il faut une base,
  l'API **et** le front, donc trois processus à composer et à arrêter proprement.
- `NEXT_PUBLIC_API_URL` est figé à la compilation du bundle client. Le front doit
  donc être **rebuild** pour l'e2e avec l'URL de l'API de test, et cette variable
  doit être déclarée à turbo — sans quoi le cache resservirait un build fait avec
  l'URL par défaut, et la suite interrogerait une API qui n'existe pas.

### Neutral

- Le dossier vendoré est exclu du lint et du typecheck applicatif : le
  typechecker le compilerait avec nos réglages stricts, et le premier écart
  créerait une pression pour éditer un fichier qui ne s'édite pas. Playwright
  transpile lui-même ce qu'il exécute.
- `SELECTORS.md` arrive dans le dépôt par le vendoring, à côté de la suite qui
  l'exige, plutôt que recopié à la main comme document de référence.
