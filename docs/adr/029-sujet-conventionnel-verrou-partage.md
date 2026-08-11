# ADR 029 — Sujet conventionnel : un verrou partagé entre le hook et la CI

## Status

Accepted — 2026-08-11. Sous-item **`pr-title.yml`** de l'item **D5** du plan
d'outillage (Phase 6), et réponse au report inscrit dans `lefthook.yml` depuis la
Phase 0 (« les conventional commits (commitlint) […] sont traités en Phase 6 »).

## Context

L'[ADR 028](028-changelog-et-release-via-release-please.md) a confié à
release-please la dérivation de la version, du `CHANGELOG.md` et du tag depuis
l'historique conventionnel de `main`. Ce déplacement change ce que coûte un sujet
mal formé : tant que le changelog était rédigé à la main, `ajoute le tri par tag`
était une faute de style ; depuis, le même sujet est **invisible de l'outil**. Le
changement part en production sans ligne de changelog et sans effet sur le semver,
et rien ne le signale — le seul symptôme est un CHANGELOG troué, artefact que
personne ne relit ligne à ligne.

Deux surfaces sont à garder, et la seconde est la moins évidente :

1. **Les messages de commit**, écrits sur le poste.
2. **Le titre de PR**, parce que `auto-merge.yml` squashe les PR portant le label
   `reviewed` et qu'un squash prend le **titre de la PR** comme sujet du commit
   qui atterrit sur `staging`. Une branche aux commits irréprochables peut donc
   produire une ligne d'historique illisible par son seul titre.

La rule 15 nommait déjà `pr-title.yml` par avance, place restée vide. La question
n'était donc pas *s'il faut valider*, mais *avec quoi*.

## Options Considered

| Option | Trade-off |
|---|---|
| **Script maison partagé (retenue)** | `scripts/check-conventional-subject.sh` porte la règle **une fois**, en deux modes : `--file` pour le hook `commit-msg`, `--subject` pour le titre de PR. Zéro dépendance, zéro nœud dans `node_modules`, et le fichier est lisible d'un bout à l'autre par un visiteur du dépôt (rule 18). Surtout : une seule surface à mettre en échec, donc un seul harnais de preuve. Coût : ~40 lignes de bash à maintenir, et une regex qu'il faut avoir calibrée soi-même. |
| commitlint + `amannn/action-semantic-pull-request` | Deux outils standards, bien documentés, largement adoptés. Écartée pour deux raisons cumulées. D'abord **deux sources de vérité** pour une convention unique : la liste des types vivrait dans `commitlint.config.js` *et* dans le `with:` du workflow, et rien ne les tiendrait synchronisées — c'est la copie qui dérive au premier ajout de type. Ensuite le précédent de l'[ADR 024](024-verrou-sql-brut-plugin-biome.md) : le dépôt a déjà refusé de gagner un second outil pour une seule règle. commitlint apporte un `package.json`, une config et un plugin d'action pour ce qu'une regex exprime en une ligne. |
| commitlint seul (local) | Ne couvre pas le titre de PR — précisément la surface qui devient un commit au squash. Laisse le trou principal ouvert. |
| Action tierce seule (CI) | Ne couvre pas les commits locaux : l'auteur découvre le refus après avoir poussé, pas en committant. Le dépôt tient l'invariant inverse depuis l'en-tête de `ci.yml` — « ce qui bloque un push doit bloquer une PR, et inversement ». |
| Ne rien faire | Zéro coût. Écarté : la convention est exigée par la rule 03 depuis le premier commit et n'a jamais été appliquée par autre chose que la vigilance. Un `style:` s'est déjà glissé dans l'historique, hors de la liste close. |

## Decision

Écrire la règle **une fois**, dans `scripts/check-conventional-subject.sh`, et lui
donner trois consommateurs :

- **`lefthook.yml`**, hook `commit-msg`, en `--file` — le message n'entre pas
  dans l'historique s'il ne parse pas ;
- **`.github/workflows/pr-title.yml`**, en `--subject` — déclenché sur
  `opened/edited/reopened/synchronize`. `edited` est indispensable : sans lui,
  corriger un titre refusé laisserait le check rouge jusqu'à un push sans rapport.
  Le titre transite par une **variable d'environnement**, jamais par une
  interpolation `${{ … }}` dans le corps du `run` — un titre est une chaîne
  contrôlée par l'auteur de la PR, et l'interpoler l'exécuterait sur le runner ;
- **`scripts/verify-conventional-subject.sh`**, qui met le verrou en échec en
  pre-push et dans le job CI `Quality`, comme le dépôt le fait déjà pour le garde-fou
  de secrets et le verrou SQL.

Le verrou **dispense** les sujets écrits par git : `Merge …`, `Revert "…"` et les
marqueurs d'autosquash. Le cas décisif est `Merge …` — la rule 15 impose que la
promotion `staging → main` soit un merge commit, donc un verrou qui refuse les
merges interdirait le geste même qu'il protège.

Deux contraintes ont été **écartées après mesure** sur les 147 sujets de
l'historique, plutôt que posées d'autorité :

- une limite de longueur (72 caractères) aurait refusé une dizaine de sujets
  légitimes, qui portent leur raison d'être ;
- l'obligation de minuscule initiale en aurait refusé cinq, ouverts par un
  acronyme ou un nom propre (« AC-4 assertait… », « PRD Conduit… », « README — … »).

La même mesure a révélé un défaut que le verrou seul n'aurait pas montré :
Dependabot titrait ses PR `Bump x from 1.0 to 1.1`, forme refusée. Le gate aurait
rougi sur dix PR dès le premier lundi. `.github/dependabot.yml` déclare désormais
`commit-message.prefix` (`chore` pour npm, `ci` pour les Actions), ce qui corrige
la source plutôt que d'ajouter une exception au verrou.

La liste des types reste **close et alignée sur la rule 03** (`feat`, `fix`,
`docs`, `refactor`, `test`, `chore`, `perf`, `ci`). `style` n'y figure pas, bien
qu'un commit de l'historique l'emploie : ce commit est antérieur au verrou et
nommé comme exception dans le harnais. Ajouter `style` est un changement de
convention, qui se fait dans la rule d'abord.

Rendre le check `pr-title` **requis** relève de la protection de branche, réglage
GitHub hors du dépôt : geste humain, à poser en même temps que `auto-merge.yml`
(item D6). Tant qu'il n'est pas requis, le check informe sans bloquer — ce qui est
l'étape 3 de la rule 21, et non un oubli.

## Consequences

### Positive

- Une seule règle pour les deux surfaces : le hook local et la CI ne peuvent pas
  diverger, et `verify-conventional-subject.sh` échoue si l'un cessait d'appeler
  le script partagé.
- Le CHANGELOG dérivé par release-please devient fiable : un changement ne peut
  plus entrer dans `main` sous une forme que l'outil ne sait pas lire.
- Zéro dépendance ajoutée, cohérent avec l'ADR 024 ; un fichier de 40 lignes
  commenté que le dépôt vitrine peut montrer tel quel (rule 18).
- Le verrou a été calibré sur l'historique réel avant d'être posé, et cette
  calibration a produit un correctif de fond sur Dependabot.

### Negative

- Une regex maison à maintenir, là où commitlint aurait porté la spécification
  complète des Conventional Commits (footers, `BREAKING CHANGE:`, casse des
  pieds). Le verrou ne valide que le **sujet** — assumé, c'est lui qui détermine
  le type et le bump.
- Le bash est moins accueillant qu'un fichier de config pour un contributeur qui
  voudrait ajuster la règle ; le commentaire d'en-tête doit rester à jour.
- Un contournement reste possible en local (`git commit --no-verify`) ; seule la
  CI ferme cette porte, et seulement une fois le check rendu requis.

### Neutral

- Le domaine `release` apparaît dans `docs/requirements/non-functional/` avec
  REQ-RELEASE-001 ; les exigences ultérieures de la Phase 6 (auto-merge, déploiement)
  s'y rattacheront naturellement.
- Le script est appelable à la main sur n'importe quelle chaîne, ce qui en fait
  aussi l'outil de diagnostic quand un titre est refusé sans que la raison saute
  aux yeux.
