---
id: REQ-RELEASE-001
title: Refuser un sujet de commit ou un titre de PR qui n'entrerait pas dans le CHANGELOG
type: non-functional
domain: release
status: implemented
priority: must
source: "plan outillage-craft item D5 / sous-item pr-title.yml (Phase 6 — méthodologie & release) ; rule 03 (Conventional Commits obligatoires) ; rule 15 (workflow pr-title.yml, promotion en merge commit) ; ADR 028 (release-please) ; ADR 029"
acceptance_criteria:
  - id: AC-1
    given: "un sujet qui ne parse pas en Conventional Commit — type absent, type inconnu, type capitalisé, deux-points manquant, description vide"
    when: "le verrou s'exécute, en hook `commit-msg` sur le message ou en CI sur le titre de PR"
    then: "il sort en erreur et nomme ce qui manque, plutôt que de laisser entrer un changement que release-please ne saura pas lire"
  - id: AC-2
    given: "les formes conventionnelles valides — avec et sans scope, avec `!` de breaking change, scope à tiret ou pointé, description commençant par un acronyme, sujet de plus de 100 caractères"
    when: "le verrou s'exécute"
    then: "il les accepte toutes : un verrou qui refuse aussi la forme valide ne laisse d'autre issue que `--no-verify`, et emporte alors ce qu'il protégeait"
  - id: AC-3
    given: "un sujet écrit par git lui-même — `Merge …`, `Revert \"…\"`, ou un marqueur d'autosquash (`fixup!`, `squash!`, `amend!`)"
    when: "le verrou s'exécute"
    then: "il l'accepte — sans quoi la promotion `staging → main` en merge commit qu'impose la rule 15 deviendrait impossible, et le verrou interdirait le geste même qu'il protège"
  - id: AC-4
    given: "les 147 sujets de l'historique réel du dépôt"
    when: "le verrou leur est confronté un par un"
    then: "aucun n'est refusé, hormis un unique `style:` antérieur au verrou et nommé comme exception — c'est la calibration qui a écarté une limite de longueur et l'obligation de minuscule initiale"
  - id: AC-5
    given: "le hook `commit-msg` local et le workflow `pr-title.yml` de la CI"
    when: "on inspecte leur câblage"
    then: "les deux appellent le même script et aucun ne redéclare la liste des types : la règle est écrite une fois, donc les deux côtés ne peuvent pas diverger au premier ajout de type"
  - id: AC-6
    given: "un verrou volontairement neutralisé, qui sort 0 quoi qu'il arrive, soumis au même harnais"
    when: "la vérification s'exécute"
    then: "elle le voit accepter un sujet que le verrou réel refuse — sans ce contrôle, un harnais cassé afficherait « ok » partout et deviendrait un no-op vert"
implementation:
  files:
    - scripts/check-conventional-subject.sh
    - lefthook.yml
    - .github/workflows/pr-title.yml
    - .github/workflows/ci.yml
    - .github/dependabot.yml
  tests:
    - scripts/verify-conventional-subject.sh
related:
  issues: []
  requirements:
    - REQ-SEC-001
  adrs: ["028", "029"]
---

# REQ-RELEASE-001 — Refuser un sujet de commit ou un titre de PR qui n'entrerait pas dans le CHANGELOG

## Contexte

Depuis l'[ADR 028](../../../adr/028-changelog-et-release-via-release-please.md), la
version, le `CHANGELOG.md` et le tag du dépôt ne sont plus écrits à la main : ils
sont **dérivés** par release-please de l'historique conventionnel de `main`.

Ce déplacement change la nature d'un sujet mal formé. Tant que le changelog était
rédigé à la main, `ajoute le tri par tag` était une faute de style — désagréable en
revue, sans conséquence. Depuis que l'outil lit l'historique, le même sujet est
**invisible** : le changement part en production sans ligne de changelog et sans
effet sur le semver, et rien ne le signale. Le seul symptôme est un CHANGELOG
incomplet, c'est-à-dire un artefact que personne ne relit ligne à ligne — donc un
défaut qui ne se découvre pas.

La [rule 03](../../../../.claude/rules/03-commits-review.md) exigeait déjà des
Conventional Commits et la [rule 15](../../../../.claude/rules/15-deploiement-cicd.md)
listait `pr-title.yml` par avance. Ce qui manquait n'était pas la convention :
c'était ce qui la fait respecter.

## Règles

- **Le titre de PR compte autant que les commits.** `auto-merge.yml` squashe les
  PR portant le label `reviewed`, et un squash prend le **titre de la PR** comme
  sujet du commit qui atterrit sur `staging`. Une branche aux commits
  irréprochables peut donc produire une ligne d'historique illisible pour
  release-please, par son seul titre.
- **Une seule règle, plusieurs consommateurs.** Le hook `commit-msg` et le
  workflow appellent le même
  [`scripts/check-conventional-subject.sh`](../../../../scripts/check-conventional-subject.sh).
  Recopier la regex dans le workflow aurait donné deux sources de vérité pour une
  convention unique, et c'est toujours la copie qui dérive ([ADR 029](../../../adr/029-sujet-conventionnel-verrou-partage.md)).
- **Les sujets écrits par git sont dispensés** (AC-3). Le cas décisif est
  `Merge …` : la rule 15 impose que la promotion `staging → main` soit un merge
  commit — un squash aplatirait les commits conventionnels et release-please
  sauterait la release. Un verrou qui refuse les merges interdirait la promotion.
- **La liste des types est close et vit dans la rule 03.** L'élargir est un
  changement de convention : il se fait dans la rule d'abord, dans le script
  ensuite. Sans cette discipline, la convention devient ce que le script tolère
  plutôt que ce que le dépôt a décidé.

## Hors périmètre

- **Le corps et les pieds de commit** (`BREAKING CHANGE:`, `Refs:`) : seul le
  sujet détermine le type et le bump. Valider le corps ajouterait du refus sans
  ajouter de garantie sur la release.
- **La véracité du type.** Rien ne peut vérifier qu'un `fix:` corrige réellement
  un défaut. Le verrou garantit la **forme**, la revue garde l'intention — même
  partage que pour le verrou SQL ([REQ-SEC-002](../security/REQ-SEC-002.md)).
- **La longueur du sujet et la casse de sa description**, écartées sur mesure :
  voir la Couverture ci-dessous.
- **Le blocage effectif de la PR.** Rendre le check `pr-title` requis relève de la
  protection de branche, réglage GitHub hors du dépôt — geste humain, tracé dans
  l'ADR 029.

## Couverture

Les six critères sont prouvés par
[`scripts/verify-conventional-subject.sh`](../../../../scripts/verify-conventional-subject.sh),
qui exécute le **script réel** sur chaque cas — jamais une copie de sa regex, qui
ne prouverait que la copie.

AC-4 est le critère qui a réellement façonné le verrou, et il mérite d'être lu
comme tel. Deux contraintes semblaient évidentes au moment de l'écrire : limiter
le sujet à 72 caractères, et exiger une description en minuscule. Confrontées aux
147 sujets du dépôt **avant** d'être posées, elles produisaient une quinzaine de
refus, tous sur des sujets légitimes — une dizaine de sujets longs qui portent
leur raison d'être, et cinq descriptions ouvertes par un acronyme (« AC-4
assertait… », « PRD Conduit… », « README — … »). Les deux ont donc été écartées.
C'est l'étape 4 de la [rule 21](../../../../.claude/rules/21-cadre-reproductible.md)
appliquée à la lettre : calibrer sur des cas réels avant de gater, plutôt que
poser un seuil au jour 1 et le désactiver six mois plus tard parce qu'il est trop
bruyant.

La même calibration a produit un correctif que le verrou seul n'aurait pas
révélé : Dependabot titrait ses PR `Bump x from 1.0 to 1.1`, forme que le verrou
refuse. Le gate aurait rougi sur les dix PR hebdomadaires dès le premier lundi.
[`.github/dependabot.yml`](../../../../.github/dependabot.yml) déclare désormais
`commit-message.prefix`, ce qui rend ses PR conformes à la source.

AC-6 ferme le mode de panne propre à ce dispositif. Le hook `commit-msg` est
silencieux quand il marche et silencieux quand il est cassé, et sa sanction
n'arrive pas au moment du commit mais des semaines plus tard, dans un changelog
troué. La présence du fichier ne prouve donc rien ; seul un refus effectif le
fait, rejoué à chaque push et sur un runner frais.
