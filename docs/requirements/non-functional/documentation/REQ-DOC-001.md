---
id: REQ-DOC-001
title: Aucun lien mort dans la documentation que le dépôt publie
type: non-functional
domain: documentation
status: implemented
priority: should
source: "plan outillage-craft item E4 (Phase 6 — rendre le cadre reproductible lisible depuis le dépôt) ; rule 14 (documentation maintenue comme du code) ; rule 21 (calibrer un contrôle avant de le rendre bloquant) ; note « Sur `.claude/rules/` » de docs/adr/README.md"
acceptance_criteria:
  - id: AC-1
    given: "un lien relatif, dans un markdown versionné, qui désigne un fichier absent — nom inexistant, ou chemin relatif faux d'un niveau"
    when: "le contrôle des liens s'exécute"
    then: "il sort en erreur en nommant le fichier, la ligne et la cible, plutôt que de laisser un 404 atteindre le dépôt public"
  - id: AC-2
    given: "un lien vers un fichier **présent sur le disque mais non versionné** — le cadre local `.claude/`, ou un artefact généré comme `docs/requirements/_generated/`"
    when: "le contrôle s'exécute"
    then: "il le refuse — c'est le cas qu'un contrôle écrit avec `test -f` déclarerait bon, puisque le fichier existe chez le rédacteur et nulle part ailleurs"
  - id: AC-3
    given: "des liens légitimes : cible dans le même dossier, cible atteinte par une traversée `..`, et répertoire versionné"
    when: "le contrôle s'exécute"
    then: "il les accepte tous — un contrôle qui refuse aussi les liens valides ne laisse d'autre issue que de le désactiver"
  - id: AC-4
    given: "un lien externe (`https://`, `mailto:`), une ancre pure (`#section`) et une ancre portée par un fichier (`cible.md#status`)"
    when: "le contrôle s'exécute"
    then: "il ignore les trois premières formes et résout la quatrième sur son seul chemin de fichier : rien de ce qui ne désigne pas un fichier du dépôt n'a à être résolu sur le disque"
  - id: AC-5
    given: "les markdown vendorés de `docs/prd/**` (29 liens, chemins absolus du site produit) et la mémoire de session de `artifacts/**` (20 liens)"
    when: "le contrôle s'exécute"
    then: "il ne les examine pas : les inclure le rendrait rouge en permanence, donc désactivé — et réécrire une spécification vendorée la ferait diverger de sa source"
  - id: AC-6
    given: "une syntaxe de lien citée **comme du code** — entre accents graves, ou dans un bloc délimité par ``` — comme le fait toute documentation qui décrit une convention de liens"
    when: "le contrôle s'exécute"
    then: "il ne la traite pas comme un lien : sans quoi le contrôle refuserait la documentation qui l'explique, ce qui s'est produit sur ce REQ même au premier commit du garde-fou"
  - id: AC-7
    given: "un contrôle volontairement neutralisé, qui sort 0 quoi qu'il arrive, soumis au même harnais"
    when: "la vérification s'exécute"
    then: "elle le voit accepter un lien mort que le contrôle réel refuse — sans quoi un harnais cassé afficherait « ok » partout et deviendrait un no-op vert"
implementation:
  files:
    - scripts/check-doc-links.sh
    - lefthook.yml
    - .github/workflows/ci.yml
  tests:
    - scripts/verify-doc-links.sh
related:
  issues: []
  requirements:
    - REQ-RELEASE-001
  adrs: ["005"]
---

# REQ-DOC-001 — Aucun lien mort dans la documentation que le dépôt publie

## Contexte

Ce dépôt est **public**, et son cadre de développement (`.claude/`) est **privé** :
il est exclu par `.gitignore`. Les deux faits sont volontaires et documentés ; leur
combinaison ne l'est pas.

Un rédacteur qui écrit `[rule 19](../../.claude/rules/19-securite.md)` voit un lien
qui fonctionne parfaitement — le fichier est là, sur son disque. Pour un lecteur du
dépôt, c'est un 404. Le mode de panne est désagréable parce que **le contrôle local
ne peut pas le voir** : localement, tout est correct. Seul un contrôle qui interroge
`git` plutôt que le disque distingue « le fichier existe » de « le fichier existe
pour un lecteur du dépôt ».

La note « Sur `.claude/rules/` » de [`docs/adr/README.md`](../../../adr/README.md)
demandait déjà de citer ces fichiers **en clair plutôt qu'en lien**. Le dépôt en
portait pourtant 8, dont 3 écrits le jour même où ce contrôle a été posé. C'est
l'argument habituel de ce dépôt pour transformer une consigne en contrôle : la
consigne existait, elle était juste, et elle n'a pas suffi.

## Règles

- **Le critère est « versionné », pas « présent ».** `git ls-files` et non
  `test -f` : c'est toute la différence entre un contrôle qui attrape ce défaut et
  un contrôle qui le déclare vert (AC-2).
- **Un fichier non versionné se cite en clair.** Le cadre local et les artefacts
  générés ([ADR 005](../../../adr/005-matrice-de-tracabilite-generee.md)) se
  mentionnent par leur nom, jamais par un lien.
- **Le périmètre est ce que ce dépôt rédige.** Les spécifications vendorées et la
  mémoire de session en sont exclues (AC-5), pour les raisons mesurées ci-dessous.

## Hors périmètre

- **Les liens externes** (`https://`) : leur validité dépend d'un serveur tiers, et
  un contrôle réseau en pre-commit serait à la fois lent et instable.
- **Les ancres** (`#section`) : vérifier qu'un titre existe demanderait de parser le
  markdown cible. Le gain est faible — une ancre morte dégrade la navigation, elle
  ne casse pas le lien.
- **La justesse du texte du lien.** Un lien qui pointe vers le bon fichier sous un
  mauvais libellé reste un défaut de relecture, pas de résolution.
- **`docs/prd/**` et `artifacts/**`**, voir AC-5.

## Couverture

Les sept critères sont prouvés par
[`scripts/verify-doc-links.sh`](../../../../scripts/verify-doc-links.sh), qui
exécute le **script réel** — recopié tel quel dans un dépôt jetable, puisqu'il
déduit sa racine de son propre chemin — sur seize fixtures.

Ce contrôle a payé dès sa première exécution, et pas sur le défaut qu'il visait :
outre les 8 liens vers le cadre local, il a relevé **quatre liens d'ADR et de REQ
désignant un fichier renommé** (`015-prechargement-…` et `010-unicite-du-slug-par-la-contrainte`,
tous deux renommés depuis sans que leurs référents suivent) et **un lien de l'ADR 009
qui sortait du dépôt** vers le dossier produit privé — un 404 public doublé d'un
chemin interne exposé, alors qu'une copie vendorée du fichier visé existait à deux
dossiers de là. Aucun de ces cinq défauts n'avait de rapport avec `.claude/` : ils
étaient là, invisibles, parce que rien ne suivait les liens.

Le périmètre est **mesuré, pas décrété** (rule 21, étape 4). Inclure `docs/prd/**`
et `artifacts/**` ajouterait 49 signalements permanents : 29 chemins absolus du site
produit, corrects à leur origine et qu'on ne réécrit pas sous peine de faire diverger
la copie de sa source, et 20 renvois internes de la mémoire de session. Hors de ces
deux familles, le compte est **zéro** — c'est ce qui autorise à poser le contrôle
bloquant d'emblée, avec un seuil éprouvé plutôt qu'un seuil arbitraire.

AC-3 mérite une note. Sa fixture de traversée `..` n'est pas décorative : c'est elle
qui a révélé que `unset tableau[-1]` échoue en silence sous le **bash 3.2** livré par
macOS, laissant la pile de segments non dépilée et le chemin résolu dans une branche
inexistante. Le contrôle rapportait alors des liens morts qui n'en étaient pas — un
faux positif massif, du genre qui fait retirer un garde-fou plutôt que le corriger.
