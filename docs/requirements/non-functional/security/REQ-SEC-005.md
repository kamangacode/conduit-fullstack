---
id: REQ-SEC-005
title: Analyser statiquement le code et les workflows, et prouver que l'analyse publie
type: non-functional
domain: security
status: implemented
priority: should
source: "plan outillage-craft item B7 (Phase 5 — CodeQL SAST) ; rule 19 (SAST dans la CI, defense in depth) ; rule 21 (démarrer en rapport non bloquant, calibrer, puis gater)"
acceptance_criteria:
  - id: AC-1
    given: "le workflow `codeql.yml` tel qu'il est versionné"
    when: "le contrôle de câblage s'exécute"
    then: "il l'accepte — contrôle positif sans lequel un contrôle qui refuserait tout satisferait tous les critères de refus ci-dessous"
  - id: AC-2
    given: "le même workflow amputé de la permission `security-events: write`"
    when: "le contrôle s'exécute"
    then: "il refuse en nommant la permission — c'est la panne la plus silencieuse du dispositif : l'analyse tourne, réussit, et n'uploade rien, sans qu'aucun job ne rougisse"
  - id: AC-3
    given: "le même workflow amputé du langage `actions` dans sa matrice"
    when: "le contrôle s'exécute"
    then: "il refuse — ce langage couvre `.github/workflows/`, donc la surface `pull_request_target` du dépôt ; le retirer laisserait un SAST d'apparence normale, aveugle à la partie la plus risquée"
  - id: AC-4
    given: "le même workflow amputé du déclencheur `pull_request`"
    when: "le contrôle s'exécute"
    then: "il refuse — une analyse qui ne tourne qu'après merge ne protège plus rien qu'un audit rétrospectif"
  - id: AC-5
    given: "le même workflow dont `build-mode` passe de `none` à `autobuild`"
    when: "le contrôle s'exécute"
    then: "il refuse — ces deux langages s'analysent sans compilation, et un autobuild n'aurait rien à construire ici"
  - id: AC-6
    given: "le même workflow amputé de son étape `codeql-action/analyze`"
    when: "le contrôle s'exécute"
    then: "il refuse — un workflow qui initialise CodeQL sans jamais publier consomme des minutes de runner en restant vert"
  - id: AC-7
    given: "un contrôleur volontairement neutralisé, qui sort 0 quoi qu'il arrive, soumis au même harnais sur un câblage amputé"
    when: "la vérification s'exécute"
    then: "elle le voit accepter ce que le contrôleur réel refuse — sans quoi un harnais cassé afficherait « ok » sur les cinq sabotages et certifierait un contrôle absent"
implementation:
  files:
    - .github/workflows/codeql.yml
    - scripts/check-codeql-wiring.mjs
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-codeql-wiring.sh
related:
  issues: []
  requirements:
    - REQ-SEC-002
  adrs: []
---

# REQ-SEC-005 — Analyser statiquement le code et les workflows, et prouver que l'analyse publie

## Contexte

La `rule 19` (cadre local, non publié) demandait un SAST dans la CI, au titre de
la défense en profondeur, à côté du scan de secrets et de l'audit de dépendances
déjà en place. La place était restée vide.

Deux surfaces sont analysées, et la seconde est celle qui a motivé l'activation.
`javascript-typescript` couvre `apps/` et `packages/` — l'attendu. `actions`
couvre `.github/workflows/`, et ce dépôt vient d'y ajouter trois fichiers en deux
jours, dont un sur `pull_request_target` : le déclencheur qui s'exécute avec les
droits du dépôt de base, et dont la mauvaise utilisation — checkout du code de la
PR, interpolation d'une entrée contrôlée par son auteur dans un `run` — est la
faille la plus répandue de l'écosystème Actions. Ces deux pièges ont été évités à
la main ; les requêtes `actions` de CodeQL sont ce qui le vérifie sans dépendre
de la vigilance du prochain contributeur.

## Règles

- **Non bloquant, à ce stade et à dessein.** Le workflow publie dans l'onglet
  Security, n'entre pas dans `ci-success` et ne ferme aucune PR. C'est l'étape 3
  de la rule 21 : un contrôle neuf commence en rapport, le temps de mesurer son
  bruit sur des cas réels. Le passer en gate est un second geste, avec un seuil
  éprouvé.
- **Le « default setup » de code scanning doit rester désactivé.** Il est
  exclusif du workflow d'« advanced setup » posé ici ; l'activer ferait échouer
  l'analyse. Il était à `not-configured` au moment de l'écriture.

## Hors périmètre

- **La correction des alertes.** Cette exigence garantit que l'analyse tourne et
  publie, pas qu'elle ne trouve rien. Le traitement des alertes est un travail
  distinct, qui commencera par mesurer leur volume.
- **Le gate.** Rendre les alertes bloquantes suppose un seuil calibré ; il n'en
  existe aucun tant qu'aucun run n'a produit de résultat.
- **OSV-Scanner et le SBOM CycloneDX**, autres volets de l'item B7 : traités
  séparément.
- **L'audit de dépendances**, déjà couvert par le job `Audit vulnérabilités` de
  `ci.yml`, lui aussi non bloquant.

## Couverture

Les sept critères sont prouvés par
[`scripts/verify-codeql-wiring.sh`](../../../../scripts/verify-codeql-wiring.sh),
qui sabote le **vrai** workflow — en modifiant son arbre YAML, une propriété à la
fois — et exige un refus à chaque fois.

Ce harnais existe parce que **un workflow CodeQL mal câblé réussit**. C'est ce
qui le rend traître : job vert, durée plausible, et rien ne distingue une analyse
publiée d'une analyse perdue. Trois régressions suffisent à tout perdre sans un
seul rouge — la permission `security-events: write` retirée, le langage `actions`
sorti de la matrice, ou le déclencheur `pull_request` supprimé. Aucune ne produit
d'échec ; elles ne se constatent qu'en lisant le câblage.

Le contrôle est **YAML-aware** et non textuel : un `grep` sur `security-events`
serait satisfait par le mot en commentaire, et `codeql.yml` en contient
justement plusieurs qui parlent de cette permission.

Les variantes sabotées dérivent du fichier réel plutôt que de fixtures écrites à
la main : une fixture diverge de l'original dès la première évolution, et le
harnais se mettrait alors à prouver des propriétés d'un fichier que le dépôt
n'utilise plus. AC-7 ferme la boucle — sans lui, un harnais qui rendrait toujours
« refusé » afficherait cinq « ok » et certifierait un contrôle qui ne regarde rien.
