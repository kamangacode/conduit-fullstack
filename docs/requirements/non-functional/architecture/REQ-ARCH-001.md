---
id: REQ-ARCH-001
title: Faire de la cohérence front/back une dépendance de compilation
type: non-functional
domain: architecture
status: implemented
priority: must
source: "architecture §6 (frontière typée bout-en-bout) ; ADR 001 (package partagé comme source de vérité unique), amendé par ADR 031 (le contrat s'arrête à la frontière HTTP)"
acceptance_criteria:
  - id: AC-1
    given: "un champ du contrat partagé renommé de façon incompatible"
    when: "le typecheck du dépôt s'exécute"
    then: "`apps/api` **et** `apps/web` échouent tous les deux — pas l'un ou l'autre"
  - id: AC-2
    given: "le même renommage"
    when: "on examine les erreurs remontées"
    then: "elles désignent des fichiers de chaque application, ce qui prouve que la rupture traverse réellement la frontière"
  - id: AC-3
    given: "le contrat partagé intact"
    when: "le typecheck s'exécute"
    then: "les trois workspaces compilent — la vérification ne laisse aucun résidu"
  - id: AC-4
    given: "la vérification elle-même"
    when: "elle est exécutée"
    then: "elle restaure le dépôt dans son état d'origine, y compris si elle échoue en cours de route"
implementation:
  files:
    - packages/shared/src/model/article.ts
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-type-boundary.sh
related:
  issues: [9]
  requirements:
    - REQ-WEB-008
    - REQ-ERROR-001
  adrs:
    - "001"
---

# REQ-ARCH-001 — Faire de la cohérence front/back une dépendance de compilation

## Contexte

C'est la thèse du dépôt, et jusqu'ici elle n'était qu'**affirmée**. L'ADR 001 a
retenu le package partagé contre trois alternatives, en notant explicitement son
point faible : il « demande la discipline de tout faire transiter par `shared` ».

Une discipline ne se vérifie pas en la déclarant. Rien n'empêche aujourd'hui un
contributeur pressé de recopier une interface `Article` dans `apps/web` : le code
compilerait, les tests passeraient, et la dérive ne se manifesterait qu'au premier
changement de modèle — c'est-à-dire au moment où l'on croit le contrat garanti.
C'est exactement le mode d'échec que la spine Java + front séparé produit, et que
ce dépôt prétend éviter.

Cette exigence transforme donc l'affirmation en **propriété observable** : on
casse volontairement le modèle partagé, et l'on constate que les deux
applications refusent de compiler. Si une seule tombait, la frontière serait
typée d'un côté seulement — ce qui est pire que rien, parce qu'on s'y fierait.

AC-4 n'est pas une précaution de confort : une vérification qui laisse le dépôt
modifié après un échec transforme un diagnostic en incident, et sera désactivée à
la première occurrence.

## Amendement du 2026-08-21 (ADR 031)

Cette exigence parlait du « modèle partagé ». `packages/shared` n'a jamais porté
un modèle métier : ce sont les enveloppes de réponse, les DTOs d'entrée et la
table `CONDUIT_ERROR_STATUS`, c'est-à-dire le **contrat HTTP**. La formulation a
été alignée sur ce que le package est réellement.

La conséquence sur le fond est plus lourde que le vocabulaire. Telle qu'écrite,
l'exigence demandait que `apps/api` **dans son ensemble** cesse de compiler quand
le contrat change. C'était une exigence de couplage : elle garantissait que le
contrat traverse toutes les couches de l'API, `domain/` compris. Un dépôt qui
aurait correctement isolé son domaine aurait donc **échoué** à cette exigence.

La propriété visée devient bidirectionnelle :

- moitié **positive**, déjà couverte par AC-1 et AC-2 : casser un champ du
  contrat casse ses consommateurs légitimes ;
- moitié **négative**, pas encore couverte : ça ne doit toucher ni `src/domain/`
  ni `src/application/`.

La moitié négative n'est pas ajoutée ici parce qu'elle est **fausse à cette
date** : huit fichiers de `domain/` importent encore le contrat. Elle arrivera
avec un AC-5 et son marqueur `# it AC-5`, une fois les quatre contextes migrés
(lot T8). Écrire une exigence connue pour être violée, en la marquant
`implemented`, est exactement le mode d'échec que l'ADR 031 corrige.

## Règles

- La vérification est **active** : elle produit la rupture et observe le
  résultat, elle ne lit pas la configuration. C'est l'idiome déjà retenu pour le
  verrou Biome et pour le validateur d'exigences.
- Elle porte sur un champ réellement consommé des deux côtés, sans quoi elle
  prouverait seulement que `shared` compile.
- La restauration passe par un `trap`, pour couvrir aussi l'interruption.

## Hors périmètre

- Le choix de la frontière lui-même, tranché par l'[ADR 001](../../../adr/001-topologie-monorepo-modele-partage.md)
  et borné par l'[ADR 031](../../../adr/031-le-contrat-partage-s-arrete-a-la-frontiere-http.md).
- La moitié négative de la propriété (« le domaine ne bouge pas »), qui demande
  d'abord que ce soit vrai. Voir l'amendement ci-dessus.
- La conformité du contrat externe à la spec RealWorld, qui relève de la suite
  Hurl et de la suite Playwright (item F7).
- La détection d'un type recopié à la main : ce contrôle prouve qu'un changement
  se propage, pas qu'aucune copie n'existe. `knip` et `dependency-cruiser`
  couvrent d'autres angles ; un contrôle dédié reste à imaginer.
