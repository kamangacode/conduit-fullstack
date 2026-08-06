---
id: REQ-CONF-002
title: Confronter le front aux parcours e2e officiels, contre l'API réelle
type: non-functional
domain: conformance
status: implemented
priority: must
source: "PRD §15.2 (specs Playwright officielles) et §15.3 (conduit-fullstack : e2e Playwright sur le front) ; ADR 018"
acceptance_criteria:
  - id: AC-1
    given: "la suite e2e officielle vendorée, une base vierge, l'API compilée et le front compilé"
    when: "la suite est exécutée en entier"
    then: "les 12 fichiers de specs sont exécutés, sans fichier exclu du run ni test désactivé de notre fait — les seuls tests sautés sont ceux que la suite amont saute elle-même"
  - id: AC-2
    given: "un front qui ne satisfait pas le contrat (page vide servie à la place de l'application)"
    when: "la suite est exécutée contre lui"
    then: "elle sort en code non nul, de sorte que le job de CI qui l'appelle porte un vrai verdict et non un vert de complaisance"
  - id: AC-3
    given: "la copie vendorée, dont les helpers vivent dans un sous-dossier"
    when: "un fichier imbriqué est retouché localement puis le contrôle de dérive exécuté"
    then: "le contrôle le détecte et échoue — un lister à plat rapporterait « ok » alors que le fichier définissant l'inscription et la connexion aurait été réécrit"
  - id: AC-4
    given: "l'URL de l'API figée dans le bundle client à la compilation"
    when: "le front est construit pour l'exécution e2e"
    then: "le bundle servi porte l'URL de l'API de test, et non celle par défaut — un artefact de cache construit avec une autre URL ferait interroger à la suite une API qui n'existe pas"
  - id: AC-5
    given: "le job de CI qui exécute la suite e2e"
    when: "la suite échoue"
    then: "le job remonte le signal sans faire échouer la CI et n'entre pas dans l'agrégat `ci-success` — la bascule en gate est un geste ultérieur et délibéré, pas un oubli"
implementation:
  files:
    - apps/web/conformance/UPSTREAM.md
    - apps/web/playwright.config.ts
    - scripts/test-e2e.sh
    - turbo.json
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-e2e-gate.sh
    - scripts/verify-conformance-drift.sh
related:
  issues: [10, 11]
  requirements:
    - REQ-CONF-001
    - REQ-WEB-007
  adrs: ["014", "018"]
---

# REQ-CONF-002 — Confronter le front aux parcours e2e officiels, contre l'API réelle

## Contexte

[REQ-CONF-001](REQ-CONF-001.md) a rendu le contrat externe de l'API exécutable et
a montré ce que ça coûtait de ne pas l'avoir fait plus tôt : 29 assertions en
échec au premier run, sur des chemins que toutes nos suites déclaraient couverts,
et un commentaire de code qui affirmait depuis deux slices une conformité que
personne n'était en position de contredire.

Le front est aujourd'hui dans cette situation exacte. Il porte 209 tests, une
couverture de critères à 100 %, et un contrat de sélecteurs
([ADR 014](../../../adr/014-conformite-au-contrat-de-selecteurs-e2e.md)) auquel
il déclare se conformer. Cette conformité n'a jamais été **exécutée** : F4b a lu
`SELECTORS.md` et rendu le markup en conséquence, ce qui prouve notre lecture du
document, pas l'accord du front avec la suite qui s'en sert.

Trois différences avec REQ-CONF-001 méritent d'être nommées, parce qu'elles
expliquent les critères.

**Le front ne se teste pas isolément.** Un parcours e2e traverse le navigateur,
le front, l'API et la base. Un test qui passerait contre une API simulée ne
dirait rien de plus que nos tests de composants, qui simulent déjà le client HTTP.
AC-1 exige donc le trio réel.

**Le harnais peut mentir plus facilement qu'en HTTP.** Une suite Playwright mal
câblée — mauvais `testDir`, `baseURL` absent, zéro fichier trouvé — sort en 0 et
affiche un vert. C'est le mode d'échec le plus dangereux de cet item, et AC-2
existe pour le fermer : on oppose la suite à un front délibérément faux et on
constate qu'elle rougit.

**L'URL de l'API est figée à la compilation.** `NEXT_PUBLIC_API_URL` entre dans le
bundle client au build, pas au démarrage. Un front construit avec l'URL par
défaut puis servi pour l'e2e enverrait ses requêtes ailleurs, et les échecs
ressembleraient à des défauts de conformité. AC-4 vérifie l'artefact plutôt que
l'intention.

AC-5 enfin acte que ce contrôle démarre en **rapport** et non en gate
([ADR 018](../../../adr/018-conformite-e2e-suite-officielle-vendoree.md)) : la
suite pilote un navigateur réel, ses modes d'échec incluent des situations qui ne
disent rien de la conformité, et poser le seuil avant d'avoir mesuré le bruit
produit le gate qu'on désactive six mois plus tard (rule 21, étape 3).

## Règles

- La suite est exécutée **en entier**, sans exclusion de fichier. Les seuls tests
  non exécutés sont ceux que la suite amont saute d'elle-même.
- Les fichiers vendorés ne sont **jamais** édités : l'invariant de
  l'[ADR 016](../../../adr/016-suite-de-conformite-vendoree.md) s'applique mot
  pour mot au dossier `apps/web/conformance/e2e/`.
- Ce que nous écrivons vit **hors** du dossier vendoré : la configuration
  Playwright qui étend la base amont, et le script qui compose base, API et
  front.
- L'exécution part d'une base **vierge**, comme celle de REQ-CONF-001, et sur une
  base distincte — les deux suites doivent pouvoir tourner sans se marcher dessus.

## Hors périmètre

- La conformité de l'API, couverte par [REQ-CONF-001](REQ-CONF-001.md).
- La bascule du job de rapport en gate : elle demande quelques runs réels pour
  calibrer, et reste inscrite au plan d'outillage comme item distinct.
- Une suite e2e **maison** en Page Object Model : écartée par
  l'[ADR 018](../../../adr/018-conformite-e2e-suite-officielle-vendoree.md), qui
  distingue conformité (assertions d'un tiers) et régression (assertions de nous).

## Couverture

AC-1 est prouvé par l'exécution elle-même. AC-2 et AC-4 sont prouvés par
`verify-e2e-gate.sh`, qui oppose la suite à un front factice et vérifie
l'artefact compilé. AC-3 est prouvé par le mode « fichier imbriqué retouché »
de `verify-conformance-drift.sh`.

**AC-5 n'est pas couvert par un test, et c'est délibéré** — comme l'AC-5 de
[REQ-CONF-001](REQ-CONF-001.md), et pour une raison voisine. Le prouver
demanderait de faire échouer la suite dans un vrai run de CI et de constater que
`ci-success` reste vert : un test qui rend la CI rouge pour vérifier qu'elle ne
l'est pas. La propriété se lit dans `.github/workflows/ci.yml` — le job `E2E` est
en `continue-on-error` et absent du `needs` de `ci-success` — et c'est cette
lecture qui fait foi. Critère **sciemment non couvert**, pas oublié.

## Ce que le premier run a rendu

**139 tests collectés et exécutés : 87 verts d'emblée, 2 verts au retry, 50 en
échec.** Soit 89 verts pour 50 échecs, aucun sur un parcours d'authentification.

Les 2 instables sont la première mesure du bruit que l'ADR 018 annonçait vouloir
observer avant de gater : un taux non nul, sur une suite qui pilote un navigateur
à travers l'hydratation de Next. C'est peu, et c'est exactement pourquoi la
décision de ne pas gater au jour 1 se juge sur plusieurs runs et non sur celui-ci.
Cette exigence est `implemented` parce que la **capacité** existe et est prouvée —
la suite s'exécute en entier, le harnais sait rougir, la copie est protégée de la
retouche. Elle ne dit rien de la conformité du front, qui n'est pas son objet :
c'est le même partage qu'en F7a, où REQ-CONF-001 était satisfaite tandis que les
29 assertions rouges relevaient de [REQ-ERROR-002](../../functional/error/REQ-ERROR-002.md)
et [REQ-USER-005](../../functional/user/REQ-USER-005.md).

Les 50 échecs se répartissent sur neuf fichiers, et se lisent comme cinq
manques distincts plutôt que cinquante défauts indépendants :

| Fichiers | Échecs | Ce que le contrat exige et que le front ne fait pas |
|---|---|---|
| `error-handling`, `user-fetch-errors` | 24 | Rendre lisibles les pannes réseau et les 4xx/5xx (dont un mode « indisponible » qui conserve le jeton) |
| `url-navigation`, `navigation` | 11 | Porter le flux et la page **dans l'URL** (`?feed=following`, `?page=N`) |
| `settings`, `null-fields` | 8 | Mettre à jour bio et image, et ne jamais rendre `null` littéralement |
| `social` | 4 | Suivi, profil d'autrui, articles favoris, flux personnalisé |
| `articles`, `comments` | 3 | Favori depuis la liste, et invite à se connecter pour commenter |

Le parcours nommé au plan d'outillage pour F7b — connexion, création d'article,
commentaire — passe : `auth.spec.ts` est vert en entier, et les échecs
d'`articles` et de `comments` portent sur le favori et sur l'invite anonyme, pas
sur la publication ni sur le dépôt d'un commentaire.

Chaque ligne du tableau appelle son propre REQ fonctionnel, à écrire avant
correction et non après. C'est le travail que cette exigence rend possible ; ce
n'en est pas le contenu.

Aucun de ces échecs ne vient d'une assertion contestable : ce sont des écarts
réels entre le front et le contrat, et les symptômes les plus fréquents se
nomment précisément — pas de redirection vers `/profile/:username` après
enregistrement des paramètres (12), indicateur `Connecting` absent (10),
pagination rendue autrement que `.pagination button` (8), `.nav-link` sans classe
`active` (6), `.profile-page` absent (6), `.article-page` absent sur une réponse
500 (6), `.error-messages` absent sur certains refus (5).

Le front portait 209 tests et une couverture de critères à 100 % — exactement la
situation de l'API avant REQ-CONF-001, et la même leçon : nos tests prouvaient
que le front faisait ce que **nous** avions dit.
