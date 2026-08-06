---
id: REQ-CONF-001
title: Faire du contrat externe une vérification exécutable
type: non-functional
domain: conformance
status: implemented
priority: must
source: "PRD §15.1 (tests Hurl, source de vérité) et §15.3 (conduit-fullstack : Hurl au vert sur l'API) ; ADR 016"
acceptance_criteria:
  - id: AC-1
    given: "la suite officielle RealWorld vendorée et une instance de `apps/api` sur une base vierge"
    when: "la suite est exécutée en entier"
    then: "les 13 fichiers passent, sans exception tolérée ni fichier exclu du run"
  - id: AC-2
    given: "un défaut de conformité introduit dans l'API"
    when: "la suite est exécutée"
    then: "elle échoue avec un code de sortie non nul, de sorte que le job de CI qui l'appelle rougit réellement"
  - id: AC-3
    given: "la copie vendorée de la suite"
    when: "le contrôle de dérive s'exécute"
    then: "il compare octet pour octet à l'amont au SHA épinglé et signale tout fichier local modifié, ajouté ou supprimé — la retouche d'une assertion gênante est le seul moyen de rendre cette exigence décorative"
  - id: AC-4
    given: "un SHA épinglé qui n'est plus le `HEAD` de l'amont"
    when: "le contrôle de dérive s'exécute"
    then: "il le signale comme une information distincte d'une retouche locale, et ne fait pas échouer le run — le contrat qui évolue chez un tiers n'est pas un défaut de ce dépôt"
  - id: AC-5
    given: "l'absence de réseau ou l'indisponibilité de l'amont"
    when: "la suite de conformité est exécutée"
    then: "elle rend son verdict quand même : l'exécution ne dépend que de la copie vendorée, et seul le contrôle de dérive est empêché"
implementation:
  files:
    - apps/api/conformance/UPSTREAM.md
    - scripts/test-conformance.sh
    - scripts/check-conformance-drift.sh
    - .github/workflows/ci.yml
  tests:
    - scripts/test-conformance.sh
    - scripts/verify-conformance-drift.sh
    - scripts/verify-conformance-gate.sh
related:
  issues: [10]
  requirements:
    - REQ-ERROR-002
    - REQ-USER-005
    - REQ-ARCH-001
  adrs: ["016"]
---

# REQ-CONF-001 — Faire du contrat externe une vérification exécutable

## Contexte

Le dépôt sait déjà prouver sa cohérence **interne** : REQ-ARCH-001 casse le
modèle partagé et constate que les deux applications refusent de compiler. Rien
ne prouvait jusqu'ici sa conformité **externe** — c'est-à-dire que ce qu'`apps/api`
met sur le fil est bien ce que la spec RealWorld décrit, et non ce que nous avons
compris de la spec RealWorld.

L'écart entre les deux n'est pas théorique. La première exécution de la suite
officielle a produit 29 assertions en échec, et les commentaires du code
affirmaient à cet endroit précis que les messages étaient « repris verbatim » de
l'implémentation de référence. Une affirmation invérifiable avait tenu lieu de
vérification pendant deux slices, sans que rien ne la contredise — parce que rien
n'était en position de la contredire.

C'est le même motif que REQ-ARCH-001 traitait pour la thèse du dépôt : une
propriété **affirmée** vaut zéro tant qu'elle n'est pas **observée**. La
différence ici est que l'observateur n'est pas de nous : la suite est écrite en
amont, ce qui est exactement ce qui lui donne sa valeur. Un test de conformité
qu'on écrirait soi-même ne testerait que sa propre compréhension.

AC-3 est le cœur de l'exigence et mérite d'être lu deux fois. Une suite vendorée
qu'on peut éditer ne prouve plus rien : il suffit de corriger l'assertion qui
dérange pour repasser au vert, et le geste ne laisse aucune trace lisible dans un
diff de 1 709 lignes. Le contrôle de dérive existe pour rendre ce geste
détectable — c'est la seule triche capable de vider l'exercice de son sens.

AC-4 dit la contrepartie : un contrat qui évolue chez un tiers n'est pas un
défaut de ce dépôt, et le traiter comme tel produirait un gate rouge un matin
sans qu'aucune ligne n'ait bougé ici. Le contrôle rapporte, il ne bloque pas
(rule 21, étape 3).

AC-5 protège la propriété qui justifie le vendoring : si l'exécution dépendait du
réseau, le verdict de conformité dépendrait de la disponibilité de GitHub.

## Règles

- La suite est exécutée **en entier**. Exclure un fichier serait déclarer la
  conformité sur un sous-ensemble choisi par nous, ce qui la vide de son sens.
- Les fichiers `.hurl` ne sont **jamais** édités
  ([ADR 016](../../../adr/016-suite-de-conformite-vendoree.md)). Une assertion
  qui échoue est un défaut de l'API.
- L'exécution est un **gate** ; le contrôle de dérive est un **rapport**. Les
  deux ne dépendent pas des mêmes choses et n'ont donc pas la même autorité.
- La suite tourne sur une base **vierge** : elle crée ses propres comptes et
  articles à partir d'un identifiant de run, et son verdict ne doit dépendre
  d'aucun état laissé par un run précédent.

## Hors périmètre

- Les parcours end-to-end du front, couverts par la suite Playwright officielle
  (item F7b).
- La collection Bruno et l'`openapi.yml` officiels, écartés du vendoring par
  l'[ADR 016](../../../adr/016-suite-de-conformite-vendoree.md).
- La correction des défauts que la suite révèle, qui relève des exigences
  fonctionnelles concernées — [REQ-ERROR-002](../../functional/error/REQ-ERROR-002.md)
  et [REQ-USER-005](../../functional/user/REQ-USER-005.md) pour le premier lot.

## Couverture

AC-1 à AC-4 sont prouvés par des scripts exécutés en CI : la suite elle-même
pour AC-1, `verify-conformance-gate.sh` pour AC-2 (la suite opposée à un stub
qui répond 200 à tout, donc un faux vert maximalement favorable), et
`verify-conformance-drift.sh` pour AC-3 et AC-4.

**AC-5 n'est pas couvert par un test, et c'est délibéré.** Prouver qu'une
exécution ne dépend d'aucun réseau demanderait de couper le réseau du runner,
ce qui n'est pas à notre portée dans un job GitHub Actions. La propriété tient
par construction — la suite ne lit que `apps/api/conformance/hurl/` — et par le
fait que le contrôle de dérive, lui, sort explicitement en « non concluant »
quand l'amont est injoignable. C'est un critère **sciemment non couvert**, pas
un oubli.
