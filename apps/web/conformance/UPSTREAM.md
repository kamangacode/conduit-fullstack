# Provenance de la suite e2e de conformité

Le dossier [`e2e/`](e2e/) est une **copie verbatim** de la suite Playwright
officielle RealWorld. Comme la suite Hurl côté API, elle n'est pas de nous, et
c'est exactement ce qui lui donne sa valeur : le front porte déjà 209 tests
écrits ici, qui prouvent qu'il fait ce que nous avons dit. Ceux-ci prouvent qu'il
fait ce que la spec dit.

| | |
|---|---|
| Dépôt amont | <https://github.com/realworld-apps/realworld> |
| Chemin amont | `specs/e2e/` |
| Commit épinglé | `450bbc5410c7c1b7feca0f238e002162468e2a6c` |
| Date du commit | 2026-05-05 |
| Contenu | 22 fichiers, 3 791 lignes : 12 fichiers de specs (128 tests), 8 helpers, `playwright.base.ts`, `SELECTORS.md` |

C'est **le même commit** que celui épinglé par la suite Hurl
(`apps/api/conformance/UPSTREAM.md`), et ce n'est pas une coïncidence à laisser
implicite : les deux suites décrivent un seul contrat, chacune d'un côté du fil.
Les remonter séparément ferait de ce dépôt un implémenteur conforme à deux
versions différentes de la même spec.

<!--
  Ce SHA est lu par `scripts/check-conformance-drift.sh` : il est extrait du
  premier motif de 40 caractères hexadécimaux du fichier. Le déplacer ou le
  reformater casserait le contrôle de dérive — qui le dira, puisqu'il échouera.
-->

## Règle : ces fichiers ne sont jamais édités

Une assertion qui échoue est un **défaut du front**, jamais une assertion à
corriger. C'est l'invariant de l'[ADR 016](../../../docs/adr/016-suite-de-conformite-vendoree.md),
étendu au front par l'[ADR 018](../../../docs/adr/018-conformite-e2e-suite-officielle-vendoree.md).

Le dossier `helpers/` mérite une mention à part, parce qu'il concentre le
pouvoir de nuisance. `helpers/auth.ts` définit comment on s'inscrit, se connecte
et se déconnecte : assouplir ces trois fonctions rendrait vertes des dizaines de
tests d'un coup, sans toucher à un seul fichier `.spec.ts`. C'est pour ce cas
précis que le contrôle de dérive compare l'arborescence **récursivement** et que
`scripts/verify-conformance-drift.sh` éprouve activement la détection sur un
fichier imbriqué.

`pnpm conformance:drift` compare la copie à l'amont **octet pour octet** et
distingue deux situations qui n'ont pas le même sens :

- **un fichier local modifié, ajouté ou supprimé** — quelqu'un a retouché le
  contrat. C'est un défaut ;
- **le SHA épinglé qui n'est plus le `HEAD` amont** — le contrat a évolué chez
  un tiers. C'est une information, pas un défaut de ce dépôt.

Le contrôle est un **rapport, jamais un gate** : il dépend du réseau.

## Ce que ce dépôt écrit, et qui vit donc ailleurs

L'amont documente lui-même son point d'extension : `playwright.base.ts` est une
configuration de base que l'implémentation étend en fournissant `baseURL` et son
serveur. Nos deux fichiers restent **hors** de ce dossier, pour que la frontière
entre « ce qu'un tiers affirme » et « ce que nous câblons » soit lisible dans
l'arborescence :

- [`apps/web/playwright.config.ts`](../playwright.config.ts) — étend la base
  amont ;
- [`scripts/test-e2e.sh`](../../../scripts/test-e2e.sh) — compose la base, l'API
  et le front avant de lancer la suite.

## Remonter à une nouvelle version amont

Geste **manuel et délibéré**, et qui se fait **avec** celui de la suite Hurl,
puisque les deux épinglages doivent rester sur le même commit :

1. relever le nouveau SHA amont (`pnpm conformance:drift` l'affiche) ;
2. re-télécharger les deux arborescences à ce SHA ;
3. mettre à jour les deux tableaux de provenance ;
4. exécuter `pnpm conformance` et `pnpm test:e2e`, en traitant les échecs comme
   des défauts de ce dépôt, pas comme des assertions à amender.

## Ce qui n'est volontairement pas vendoré

Rien : le dossier amont est copié en entier, `SELECTORS.md` compris. Ce document
est la référence que le front doit satisfaire, et le laisser dehors reviendrait à
garder la spec à distance de la suite qui l'exige — c'est précisément l'écart que
F7a a payé côté API.
