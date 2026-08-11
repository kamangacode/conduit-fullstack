---
id: REQ-SEC-006
title: Inventorier ce qu'on embarque, le confronter à deux bases, et figer ce que la CI exécute
type: non-functional
domain: security
status: implemented
priority: should
source: "plan outillage-craft item B7 (Phase 5 — OSV-Scanner + SBOM CycloneDX) ; rule 19 (scan de dépendances dans la CI) ; rule 21 (démarrer en rapport non bloquant, calibrer, puis gater)"
acceptance_criteria:
  - id: AC-1
    given: "les workflows réellement versionnés dans `.github/workflows`"
    when: "le contrôle d'épinglage s'exécute"
    then: "il les accepte — contrôle positif sur la vraie cible, là où les fixtures ne prouvent que la capacité de juger"
  - id: AC-2
    given: "une action tierce désignée par un tag majeur, un tag précis, une branche, ou un SHA abrégé"
    when: "le contrôle s'exécute"
    then: "il refuse les quatre formes : aucune ne désigne un contenu immuable, et le propriétaire amont peut déplacer le pointeur sans qu'aucun diff du dépôt ne le montre"
  - id: AC-3
    given: "une action tierce épinglée par un SHA de 40 hexadécimaux, y compris une sous-action"
    when: "le contrôle s'exécute"
    then: "il l'accepte — contrôle négatif, sans lequel un garde-fou qui refuserait tout satisferait AC-2 en entier"
  - id: AC-4
    given: "les propriétaires `actions/` et `github/` d'une part, et des propriétaires ressemblants (`actionsxyz/`, `github-community/`) d'autre part"
    when: "le contrôle s'exécute"
    then: "il dispense les deux premiers et refuse les deux autres : la dispense porte sur le propriétaire exact et non sur un préfixe, sans quoi il suffirait de bien choisir le nom de son dépôt pour y échapper"
  - id: AC-5
    given: "une action locale (`./…`) et une image de conteneur (`docker://…`)"
    when: "le contrôle s'exécute"
    then: "il les ignore : ni l'une ni l'autre n'est une référence mobile vers un dépôt tiers"
  - id: AC-6
    given: "un garde-fou volontairement neutralisé, qui sort 0 quoi qu'il arrive, soumis au même harnais sur un tag mobile"
    when: "la vérification s'exécute"
    then: "elle le voit accepter ce que le garde-fou réel refuse — sans quoi un harnais cassé afficherait « ok » partout et certifierait un contrôle absent"
implementation:
  files:
    - scripts/check-action-pinning.sh
    - .github/workflows/ci.yml
    - lefthook.yml
  tests:
    - scripts/verify-action-pinning.sh
related:
  issues: []
  requirements:
    - REQ-SEC-005
  adrs: []
---

# REQ-SEC-006 — Inventorier ce qu'on embarque, le confronter à deux bases, et figer ce que la CI exécute

## Contexte

Trois gestes distincts composent la chaîne d'approvisionnement de ce dépôt, et
ils répondent à trois questions différentes.

**Qu'est-ce qu'on embarque ?** Un SBOM CycloneDX est généré à chaque passage du
job et publié en artefact de run. C'est l'inventaire — sans lui, répondre à
« sommes-nous exposés à cette CVE ? » suppose de reconstruire l'arbre de
dépendances de la version concernée, ce qui n'est possible qu'avec de la chance.

**Est-ce que ça contient des vulnérabilités connues ?** Deux sources plutôt
qu'une : `pnpm audit` interroge l'avis du registre npm, OSV-Scanner agrège aussi
les GitHub Security Advisories, les bases de distributions et les rapports amont.
Le recouvrement est large mais pas total, et le coût du second avis est une étape
de CI.

**Est-ce que la CI exécute bien ce qu'on croit ?** C'est le volet le moins
visible et le plus critique. `uses: foo/bar@v4` ne désigne pas un contenu mais un
**pointeur** : son propriétaire peut le déplacer, et la CI exécutera un autre code
au run suivant — sans PR, sans diff, sans notification. Compromettre le
mainteneur amont suffit ; le dépôt n'a pas besoin d'être touché.

## Règles

- **Toute action tierce est épinglée par SHA de 40 hexadécimaux.** Les actions
  de GitHub (`actions/`, `github/`) en sont dispensées : les épingler
  protégerait contre un acteur qui contrôle déjà le runner, menace hors modèle.
  C'est la ligne du guide de durcissement de GitHub.
- **La dispense est une liste blanche.** Tout ce qui n'est pas explicitement
  dispensé doit être épinglé — une liste noire échouerait ouverte sur le cas
  inattendu, qui est précisément ce contre quoi ce contrôle existe.
- **Épingler n'est pas monter de version.** Le SHA inscrit est celui vers lequel
  le tag employé pointait au moment du figeage ; le tag reste en commentaire.
  Confondre les deux ferait passer une montée majeure pour un durcissement.
- **L'inventaire précède l'évaluation.** Le SBOM est généré avant les deux scans :
  une étape en échec interrompt les suivantes, donc le placer en dernier le ferait
  perdre les jours où une vulnérabilité est trouvée — le seul moment où savoir ce
  qu'on embarque a de la valeur.

## Hors périmètre

- **Le gate.** OSV-Scanner tourne en `continue-on-error` : c'est l'étape 3 de la
  rule 21, on mesure le bruit avant de bloquer. Le dépôt a déjà joué cette
  échelle sur le job E2E, non bloquant jusqu'à trois runs verts consécutifs. Le
  verdict est publié au résumé de run pour que « non bloquant » ne veuille pas
  dire « invisible ».
- **La mise à jour des dépendances**, pilotée par Dependabot.
- **Le versionnage du SBOM.** Il est produit en artefact de run, jamais commité :
  c'est un dérivé, au même titre que la matrice de traçabilité (ADR 005).
- **Les dépendances hors npm** (image de base, binaires système) : le dépôt n'en
  embarque pas aujourd'hui.

## Couverture

Les six critères sont prouvés par
[`scripts/verify-action-pinning.sh`](../../../../scripts/verify-action-pinning.sh),
qui exécute le **garde-fou réel** sur quinze cas.

AC-4 est le critère qui décide de la valeur du dispositif, et il mérite d'être lu
deux fois. La dispense porte sur `actions/` et `github/`, **avec le `/`**. Écrite
sans lui, la comparaison serait un test de préfixe : un dépôt nommé
`actionsxyz/checkout` serait dispensé, et la liste blanche deviendrait une
passoire au bénéfice de qui choisit bien le nom de son dépôt. Deux fixtures
couvrent exactement cette frontière.

AC-3 et AC-5 sont des contrôles négatifs, et ils portent le même poids que les
refus. Un contrôle qui refuserait aussi les actions de GitHub obligerait à
épingler une trentaine de références sans bénéfice — et se ferait retirer avant
la fin de la semaine, emportant ce qu'il protégeait.

Le contrôle a payé à sa première exécution : deux actions tierces du dépôt
(`dorny/paths-filter` et `pnpm/action-setup`) roulaient encore sur un tag mobile,
alors que trois autres étaient déjà épinglées. C'est le profil habituel de ce
défaut — il ne vient pas d'une décision, mais de l'absence de contrôle sur une
convention qu'on croyait tenir. Le figeage a été fait à version **constante** :
le tag `v4` de `pnpm/action-setup` a été déréférencé vers son commit, alors que
la dernière version publiée est une `v6` — l'y monter au passage aurait déguisé
un changement fonctionnel en durcissement de sécurité.
