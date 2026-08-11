---
id: REQ-SEC-002
title: Refuser le SQL brut non paramétré au lint, sous chacune de ses formes d'appel
type: non-functional
domain: security
status: implemented
priority: must
source: "plan outillage-craft item B6 (Cluster B — sécurité & secrets) ; rule 19 (sécurité SQL : requêtes paramétrées, interdiction faite respecter par le lint) ; ADR 024"
acceptance_criteria:
  - id: AC-1
    given: "un appel à `$queryRawUnsafe` ou `$executeRawUnsafe`, sur un receveur simple, sur un receveur imbriqué, ou via un chaînage optionnel"
    when: "le lint s'exécute sur le fichier"
    then: "il sort en erreur pour **chacune** de ces formes — trois nœuds d'AST distincts qu'un motif écrit sur le seul accès par point laisse passer"
  - id: AC-2
    given: "les formes paramétrées `$queryRaw` et `$executeRaw`, qui lient leurs valeurs par tagged template"
    when: "le lint s'exécute"
    then: "il ne signale rien : un verrou qui refuse aussi la forme sûre ne laisse d'autre issue que de le désactiver, et emporte alors ce qu'il protégeait"
  - id: AC-3
    given: "un identifiant voisin (`$queryRawUnsafeWrapper`), et le nom interdit cité dans un commentaire puis dans une chaîne de caractères"
    when: "le lint s'exécute"
    then: "il ne signale rien — c'est ce qui sépare l'analyse d'AST du contrôle textuel, qui produit trois faux positifs sur cette seule fixture"
  - id: AC-4
    given: "la même fixture interdite, soumise au même harnais mais contre une configuration privée du plugin"
    when: "la vérification s'exécute"
    then: "elle la voit passer, ce qui prouve que ses rejets viennent du verrou et non d'une autre règle — sans quoi un plugin en erreur, rapporté par Biome en `info` avec un code de sortie 0, laisserait la vérification verte"
implementation:
  files:
    - biome-plugins/no-prisma-raw-unsafe.grit
    - biome.json
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-sql-raw-guard.sh
related:
  issues: []
  requirements:
    - REQ-SEC-001
  adrs: ["024"]
---

# REQ-SEC-002 — Refuser le SQL brut non paramétré au lint, sous chacune de ses formes d'appel

## Contexte

Prisma expose deux paires de méthodes dont les noms ne diffèrent que par un
suffixe. `$queryRaw` et `$executeRaw` sont des *tagged templates* : leurs valeurs
sont liées, jamais concaténées, et une chaîne construite par l'appelant y est
refusée par le typage. `$queryRawUnsafe` et `$executeRawUnsafe` prennent une
chaîne. Toute interpolation de valeur utilisateur y devient une injection SQL.

Quatre caractères séparent donc la forme sûre de la faille, dans deux
identifiants qui se ressemblent à s'y méprendre en revue. C'est précisément le
genre d'écart qu'un outil voit mieux qu'un lecteur, et la `rule 19` (cadre
local, non publié) le demandait déjà — sans que rien ne l'applique.

Cette exigence est le **pendant syntaxique** de
[REQ-SEC-001](REQ-SEC-001.md) : celle-ci refuse un secret qui entre dans
l'historique, celle-là refuse une forme de code qui entre dans la base. Les deux
partagent la même discipline — le garde-fou n'est pas considéré en place parce
qu'il est déclaré, mais parce qu'on l'a vu refuser.

## Règles

- L'interdiction porte sur l'**appel**, pas sur l'occurrence du nom. Une mention
  en commentaire ou en chaîne est légitime — cette exigence en écrit une
  elle-même.
- Le verrou vit dans le linter existant ([ADR 024](../../../adr/024-verrou-sql-brut-plugin-biome.md)),
  donc partout où Biome tourne déjà : éditeur, pre-commit, pre-push, CI. Aucun
  point de contrôle nouveau à maintenir.
- La forme paramétrée reste ouverte, et c'est une **condition de survie** du
  verrou : `$queryRaw` est la réponse à donner à qui rencontre le refus.

## Hors périmètre

- La détection d'une injection dans une requête paramétrée : par construction, il
  n'y en a pas — c'est ce qui rend le remplacement sûr.
- L'analyse de flot de types. Un alias (`const run = prisma.$queryRawUnsafe`)
  sort la méthode de son receveur et échappe au verrou ; l'ADR 024 assume ce trou
  plutôt que de laisser croire à une couverture totale.
- Les autres surfaces d'injection (NoSQL, shell, templates) : aucune n'existe
  dans ce dépôt aujourd'hui.

## Couverture

Les quatre critères sont prouvés par
[`scripts/verify-sql-raw-guard.sh`](../../../../scripts/verify-sql-raw-guard.sh),
qui soumet neuf fixtures au **vrai `biome.json`** — jamais à une configuration
fabriquée pour l'occasion, qui ne prouverait que sa propre cohérence.

AC-4 mérite d'être lu deux fois, parce qu'il ferme le mode de panne le plus
probable de tout ce dispositif. Un plugin GritQL qui ne compile pas — un groupe
capturant de trop suffit — est rapporté par Biome en `info` avec un code de
sortie **0**. Le lint reste vert, le verrou ne matche plus rien, et rien ne le
dit. Le sabotage a été joué : les quatre cas de rejet passent au rouge dans le
harnais, tandis que `pnpm lint` ne remonte aucun diagnostic du plugin. C'est la
définition même du garde-fou qu'on croit avoir.

Le verrou est **préventif** : aucun appel interdit n'existe aujourd'hui dans
`apps/api`. Un verrou qui n'a jamais rien refusé ne se distingue pas d'un verrou
qui ne fonctionne plus, sinon par une vérification qui le met en échec à chaque
push.
