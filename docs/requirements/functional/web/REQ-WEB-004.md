---
id: REQ-WEB-004
title: Mettre à jour son compte depuis la page de paramètres
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (route /settings), §7.1 (PUT /user) ; markup RealWorld `.settings-page`"
acceptance_criteria:
  - id: AC-1
    given: "un utilisateur connecté arrivant sur /settings"
    when: "la page s'affiche"
    then: "les champs sont pré-remplis avec son compte courant, mot de passe excepté"
  - id: AC-2
    given: "un champ modifié et les autres laissés tels quels"
    when: "le formulaire est soumis"
    then: "la requête ne transporte que ce qui change, et les champs non touchés conservent leur valeur"
  - id: AC-3
    given: "un mot de passe laissé vide"
    when: "le formulaire est soumis"
    then: "le mot de passe n'est pas transmis — un champ vide signifie « ne pas changer », jamais « effacer »"
  - id: AC-4
    given: "une mise à jour réussie"
    when: "la réponse arrive"
    then: "la session porte le compte à jour, et la barre de navigation reflète immédiatement le nouveau username"
  - id: AC-5
    given: "un visiteur anonyme"
    when: "il ouvre /settings"
    then: "il est redirigé vers la page de connexion plutôt que de voir un formulaire vide"
  - id: AC-6
    given: "un utilisateur connecté"
    when: "il actionne la déconnexion depuis cette page"
    then: "la session est fermée et il repasse en anonyme"
implementation:
  files:
    - apps/web/src/components/SettingsForm.tsx
    - apps/web/src/app/settings/page.tsx
  tests:
    - apps/web/src/components/SettingsForm.spec.tsx
    - apps/web/src/app/settings/page.spec.tsx
related:
  issues: [7]
  requirements:
    - REQ-WEB-002
    - REQ-WEB-006
    - REQ-USER-004
  adrs:
    - "012"
---

# REQ-WEB-004 — Mettre à jour son compte depuis la page de paramètres

## Contexte

C'est la première page entièrement personnelle du front : rien n'y est
affichable pour un anonyme, ce qui en fait un Client Component sans nuance
(ADR 012).

AC-3 est le critère central, et il prolonge une distinction déjà tranchée côté
API. `PUT /api/user` accepte une mise à jour **partielle** : une clé absente
signifie « ne pas toucher » ([REQ-USER-004](../user/REQ-USER-004.md)). Or le
formulaire de RealWorld affiche un champ mot de passe **toujours vide** — il
n'est pas pré-rempli, pour de bonnes raisons. Envoyer sa valeur telle quelle
transmettrait donc une chaîne vide à chaque enregistrement, et le compte
finirait avec un mot de passe vide ou une erreur de validation, selon ce que
l'API tolère. Le champ vide doit être **retiré de la requête**, pas transmis.

AC-2 étend le même raisonnement aux autres champs : n'envoyer que ce qui change
évite d'écraser une valeur modifiée entre-temps depuis un autre onglet.

AC-4 relie cette page à la barre de navigation : le username fait partie du lien
de profil, et une session non rafraîchie afficherait l'ancien jusqu'au prochain
rechargement — un décalage que l'utilisateur attribue à un échec de
l'enregistrement.

## Règles

- Route : `/settings` (PRD §5), authentification requise.
- Validation : `updateUserDtoSchema` de `@repo/shared`
  ([REQ-USER-001](../user/REQ-USER-001.md)).
- Champ vide ⇒ clé absente de la requête, jamais chaîne vide.
- Markup RealWorld : `.settings-page`, formulaire à cinq champs, bouton de
  déconnexion en pied de page (rule 11).
- La redirection d'un anonyme se fait côté client, après montage : le serveur ne
  connaît pas la session (ADR 012).

## Hors périmètre

- La suppression de compte : absente du contrat RealWorld.
- La consultation du profil public d'autrui : [REQ-WEB-005](REQ-WEB-005.md).
- Le rendu de la barre de navigation elle-même : [REQ-WEB-006](REQ-WEB-006.md).
