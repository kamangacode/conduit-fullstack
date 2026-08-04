---
# Gabarit d'exigence. Copier vers {functional|non-functional}/{domain}/REQ-{DOMAINE}-{NNN}.md
# puis remplacer chaque valeur. `pnpm requirements:validate` valide ce gabarit à
# chaque exécution : le laisser incohérent casserait le contrôle pour tout le monde.

# REQ-{DOMAINE}-{NNN} — le domaine en majuscules, le numéro jamais réutilisé.
id: REQ-DOMAINE-000
title: Verbe à l'infinitif décrivant le comportement attendu
# functional = comportement observable · non-functional = qualité de service.
type: functional
# Dossier de rattachement, kebab-case ASCII. Doit correspondre au chemin du fichier.
domain: domaine
# draft | proposed | approved | implemented | deprecated
# `implemented` exige implementation.files ET implementation.tests renseignés.
status: draft
# MoSCoW : must | should | could | wont
priority: must
# Section du PRD dont l'exigence dérive — l'ancre de traçabilité amont.
source: PRD §X.Y
# Au moins un critère. Numérotation séquentielle stricte à partir de AC-1 : c'est
# l'identifiant que le test reprendra en préfixe (`it('AC-1: …')`, rule 20).
acceptance_criteria:
  - id: AC-1
    given: l'état initial observable, sans ambiguïté
    when: l'action déclenchante, une seule par critère
    then: le résultat vérifiable — ce que le test assertera
implementation:
  # Chemins relatifs à la racine du dépôt. Un chemin inexistant fait échouer la validation.
  files: []
  tests: []
related:
  # Numéros d'issues GitHub.
  issues: []
  # Autres REQ (format REQ-DOMAINE-NNN), qui doivent exister dans le référentiel.
  requirements: []
  # Numéros d'ADR sur 3 chiffres, qui doivent exister dans docs/adr/.
  adrs: []
---

# REQ-DOMAINE-000 — Titre

## Contexte

Pourquoi cette exigence existe : le besoin produit, la règle métier ou la
contrainte de spec dont elle découle. Le frontmatter dit *quoi* vérifier, cette
section dit *pourquoi* — c'est elle qui permet de trancher un cas limite non
prévu par les critères.

## Règles

Les invariants que l'implémentation doit respecter (règles R-n du PRD, formats
imposés, codes d'erreur attendus). Renvoyer à la section du PRD plutôt que la
recopier : une spec recopiée diverge.

## Hors périmètre

Ce que cette exigence ne couvre volontairement pas, et vers quel REQ renvoyer le
cas échéant. Une exclusion écrite évite une revue qui reproche l'absence d'un
comportement jamais demandé.
