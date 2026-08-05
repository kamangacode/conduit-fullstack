# Provenance de la suite de conformité

Le dossier [`hurl/`](hurl/) est une **copie verbatim** de la suite de tests
officielle RealWorld. Elle n'est pas de nous, et c'est exactement ce qui lui
donne sa valeur : un test de conformité qu'on écrirait soi-même ne testerait que
sa propre compréhension de la spec.

| | |
|---|---|
| Dépôt amont | <https://github.com/realworld-apps/realworld> |
| Chemin amont | `specs/api/hurl/` |
| Commit épinglé | `450bbc5410c7c1b7feca0f238e002162468e2a6c` |
| Date du commit | 2026-05-05 |
| Contenu | 13 fichiers, 1 709 lignes, 154 requêtes |

<!--
  Ce SHA est lu par `scripts/check-conformance-drift.sh` : il est extrait du
  premier motif de 40 caractères hexadécimaux du fichier. Le déplacer ou le
  reformater casserait le contrôle de dérive — qui le dira, puisqu'il échouera.
-->

## Règle : ces fichiers ne sont jamais édités

Une assertion qui échoue est un **défaut de notre API**, jamais une assertion à
corriger. C'est l'invariant que porte l'[ADR 016](../../../docs/adr/016-suite-de-conformite-vendoree.md),
et c'est la seule triche capable de vider l'exercice de son sens : il suffirait
de retoucher la ligne qui dérange pour repasser au vert, et le geste ne se
verrait pas dans un diff de 1 709 lignes.

Si le contrat officiel se révélait réellement fautif, la voie est un correctif
en amont, pas une retouche locale.

`pnpm conformance:drift` compare la copie à l'amont **octet pour octet** et
distingue deux situations qui n'ont pas le même sens :

- **un fichier local modifié, ajouté ou supprimé** — quelqu'un a retouché le
  contrat. C'est un défaut ;
- **le SHA épinglé qui n'est plus le `HEAD` amont** — le contrat a évolué chez
  un tiers. C'est une information, pas un défaut de ce dépôt.

Le contrôle est un **rapport, jamais un gate** : il dépend du réseau, et faire
rougir la CI de chaque PR parce qu'un tiers a publié un commit ce matin
produirait le gate qu'on désactive six mois plus tard.

## Remonter à une nouvelle version amont

C'est un geste **manuel et délibéré**, parce qu'il peut faire rougir la suite
d'un coup sur des assertions qu'on n'a pas écrites :

1. relever le nouveau SHA amont (`pnpm conformance:drift` l'affiche) ;
2. re-télécharger les 13 fichiers à ce SHA ;
3. mettre à jour le tableau ci-dessus ;
4. exécuter `pnpm conformance` et traiter les échecs comme des défauts de l'API,
   pas comme des assertions à amender.

## Ce qui n'est volontairement pas vendoré

- La collection **Bruno** (`specs/api/bruno/`), générée depuis Hurl en amont :
  équivalente par construction, aucune couverture supplémentaire.
- L'**`openapi.yml`** officiel : il est le contrat d'entrée du dépôt
  `conduit-api-first`, pas de celui-ci (PRD §15.3).
- Le lanceur `run-hurl-tests.sh`, seul fichier non-`.hurl` du dossier amont : son
  `HOST` par défaut et l'exemple de son README (`http://localhost:3000/api`) sont
  incohérents avec les fichiers `.hurl`, qui écrivent déjà `{{host}}/api/…`. Nous
  appelons `hurl` directement depuis
  [`scripts/test-conformance.sh`](../../../scripts/test-conformance.sh), avec
  l'origine seule.

  Cette exclusion est **déclarée** dans `check-conformance-drift.sh` (liste
  `NOT_VENDORED`) et annoncée à chaque run. Elle ne l'a pas toujours été : tant
  que le contrôle ne listait que les `*.hurl`, l'omission tombait d'un glob et
  n'avait été décidée par personne — et la même écriture laissait ajouter en
  local n'importe quel fichier d'une autre extension sans être vue. Le passage à
  la comparaison récursive, imposé par la suite e2e et son sous-dossier
  `helpers/`, a rendu l'omission visible et donc discutable.
