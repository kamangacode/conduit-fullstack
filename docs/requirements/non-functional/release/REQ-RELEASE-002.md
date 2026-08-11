---
id: REQ-RELEASE-002
title: L'auto-merge n'alimente jamais main, et n'arme que sur accord humain explicite
type: non-functional
domain: release
status: implemented
priority: must
source: "plan outillage-craft item D6 (Phase 6 — auto-merge.yml label reviewed → squash) ; rule 15 (promotion staging → main en merge commit, jamais squash) ; ADR 028 (release-please dérive le semver de main) ; ADR 030"
acceptance_criteria:
  - id: AC-1
    given: "une pull request de travail vers `staging`, hors brouillon, à laquelle on ajoute le label `reviewed`"
    when: "la règle d'éligibilité s'exécute"
    then: "elle autorise l'armement — sans ce cas nominal, une règle qui refuse tout satisferait tous les critères de refus sans rien garder"
  - id: AC-2
    given: "la pull request de promotion `staging → main`, portant le label `reviewed`"
    when: "la règle s'exécute"
    then: "elle refuse, en nommant la raison — un squash y aplatirait les commits conventionnels et release-please sauterait la release, défaut dont le symptôme n'apparaît qu'au changelog suivant"
  - id: AC-3
    given: "une pull request vers `main` ouverte depuis une branche autre que `staging`"
    when: "la règle s'exécute"
    then: "elle refuse également : le critère porte sur la **base**, jamais sur le nom de la branche source, qui n'est même pas transmis à la règle"
  - id: AC-4
    given: "un label autre que `reviewed`, ou le même à la casse près (`Reviewed`)"
    when: "la règle s'exécute"
    then: "elle n'arme rien, sans traiter ce refus comme une panne — la plupart des labels ne demandent aucune fusion"
  - id: AC-5
    given: "une pull request en brouillon vers `staging`, labellisée `reviewed`"
    when: "la règle s'exécute"
    then: "elle refuse en le disant, plutôt que de laisser l'API GitHub échouer sur un message opaque"
  - id: AC-6
    given: "le workflow `auto-merge.yml`"
    when: "on inspecte son câblage"
    then: "il appelle la règle partagée, ne rejuge ni la base ni le label, et passe par `gh pr merge --auto` — sans `--auto`, il fusionnerait sans attendre les checks requis"
  - id: AC-7
    given: "une règle volontairement neutralisée, qui autorise tout, soumise au même harnais sur le cas de la promotion"
    when: "la vérification s'exécute"
    then: "elle la voit autoriser ce que la règle réelle refuse — sans ce contrôle, un harnais cassé certifierait vert précisément la propriété la plus coûteuse à perdre"
implementation:
  files:
    - scripts/check-auto-merge-eligibility.sh
    - .github/workflows/auto-merge.yml
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-auto-merge-eligibility.sh
related:
  issues: []
  requirements:
    - REQ-RELEASE-001
  adrs: ["028", "030"]
---

# REQ-RELEASE-002 — L'auto-merge n'alimente jamais `main`, et n'arme que sur accord humain explicite

## Contexte

Depuis l'[ADR 028](../../../adr/028-changelog-et-release-via-release-please.md),
la version et le `CHANGELOG.md` sont dérivés de l'historique conventionnel de
`main`. `main` n'est alimenté que par la promotion `staging → main`, qui doit être
un **merge commit** : un squash aplatirait les N commits conventionnels en un
seul, et release-please **sauterait la release** — pas de bump, pas de changelog,
`main` qui diverge en silence.

La rule 15 portait déjà cette contrainte, sous forme de consigne : « ne pas poser
le label `reviewed` sur la PR de promotion ». C'est le type de protection qui
tient jusqu'au jour où quelqu'un labellise par habitude. Et sa défaillance a une
propriété désagréable : **rien ne casse au moment du geste**. La PR se fusionne
proprement, la CI reste verte, et il manque simplement une release que personne ne
verra manquer avant le changelog suivant.

Cette exigence transforme la consigne en propriété du mécanisme : toute PR visant
`main` est refusée à l'armement, quel que soit son label.

## Règles

- **La base décide, pas la branche source.** Une règle écrite sur
  `head == staging` laisserait passer une PR vers `main` ouverte depuis n'importe
  quelle autre branche. La règle ne reçoit pas la branche source — la façon la
  plus sûre de garantir qu'elle n'en dépend pas (AC-3).
- **Le workflow arme, il ne décide pas.** Savoir si la CI est verte appartient à
  la protection de branche et à l'auto-merge natif. Retrancher cette décision
  obligerait à maintenir une seconde liste de checks requis, qui se tromperait au
  premier check ajouté ([ADR 030](../../../adr/030-auto-merge-arme-jamais-decide.md)).
- **La règle vit dans un script, pas dans une condition YAML.** Une condition
  `if:` ne peut pas être mise en échec : on ne peut ni lui soumettre une promotion
  labellisée pour constater le refus, ni prouver qu'un contrôle négatif la
  distingue d'une condition absente.

## Hors périmètre

- **Décider que la CI est verte** : c'est la protection de branche, par
  construction (voir Règles).
- **Poser le label.** L'accord humain reste humain ; cette exigence garantit ce
  que le label déclenche, pas qui le pose ni sur quels critères.
- **Les réglages du dépôt** — `allow_auto_merge`, et l'exigence de `ci-success`
  dans la protection de branche de `staging`. Ils vivent hors du dépôt, aucun
  code ne peut les vérifier, et leur absence rend le workflow inerte plutôt que
  dangereux.
- **La suppression des branches fusionnées** : le dépôt conserve ses branches
  d'issue, le nettoyage est une étape distincte.

## Couverture

Les sept critères sont prouvés par
[`scripts/verify-auto-merge-eligibility.sh`](../../../../scripts/verify-auto-merge-eligibility.sh),
qui exécute la **règle réelle** sur treize cas — jamais une copie de sa logique,
qui ne prouverait que la copie.

Trois d'entre eux méritent d'être lus ensemble. AC-1 vient **en premier** dans le
harnais, et ce n'est pas cosmétique : une règle qui refuserait tout satisferait
AC-2 à AC-5 sans rien garder du tout, et le rapport afficherait cinq « ok ».
AC-6 porte sur le **câblage** plutôt que sur la règle — la propriété que le
découpage devait garantir ne se lit pas dans le script, elle se lit dans ce que le
workflow en fait ; si quelqu'un remplaçait l'appel par une condition YAML « pour
éviter un checkout », la règle cesserait d'être éprouvable sans qu'aucun test ne
rougisse. AC-7 ferme le mode de panne le plus dangereux du dispositif : un harnais
cassé qui rendrait toujours « refusé » certifierait vert AC-2, c'est-à-dire
exactement la propriété dont la perte coûte le plus cher et se voit le plus tard.

Ce garde-fou a un profil que le dépôt n'avait pas encore rencontré : **il ne se
manifeste jamais quand il fonctionne**. Un auto-merge correctement refusé ne
produit aucun signal — la PR reste ouverte, ce qui ressemble à la normale. Il ne
peut donc être tenu pour posé qu'à la condition de l'avoir vu refuser, rejoué à
chaque push et sur un runner frais.
