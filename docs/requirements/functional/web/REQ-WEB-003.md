---
id: REQ-WEB-003
title: S'inscrire et se connecter depuis les pages d'authentification
type: functional
domain: web
status: implemented
priority: must
source: "PRD §5 (routes /register et /login), §7.1, §10 ; markup RealWorld `.auth-page`"
acceptance_criteria:
  - id: AC-1
    given: "la page d'inscription et un formulaire complet"
    when: "il est soumis"
    then: "le compte est créé, la session s'ouvre et l'utilisateur est redirigé vers l'accueil sans étape de connexion supplémentaire"
  - id: AC-2
    given: "la page de connexion et des identifiants valides"
    when: "le formulaire est soumis"
    then: "la session s'ouvre et l'utilisateur est redirigé vers l'accueil"
  - id: AC-3
    given: "un formulaire dont un champ ne respecte pas les règles du modèle partagé"
    when: "il est soumis"
    then: "la soumission est refusée côté client par le schéma Zod de `@repo/shared`, sans appel réseau"
  - id: AC-4
    given: "une réponse 422 ou 409 de l'API"
    when: "elle est reçue"
    then: "les messages sont affichés dans une liste `.error-messages`, un élément par message, comme le fait le front de référence"
  - id: AC-5
    given: "des identifiants refusés"
    when: "la connexion échoue en 401"
    then: "un message générique est affiché, sans distinguer email inconnu et mot de passe erroné"
  - id: AC-6
    given: "les deux pages d'authentification"
    when: "leur markup est rendu"
    then: "il suit la structure RealWorld — `.auth-page`, `.form-control.form-control-lg`, bouton `.btn-primary`, et un lien croisé vers l'autre page"
implementation:
  files:
    - apps/web/src/components/AuthForm.tsx
    - apps/web/src/components/ErrorMessages.tsx
    - apps/web/src/app/login/page.tsx
    - apps/web/src/app/register/page.tsx
  tests:
    - apps/web/src/components/AuthForm.spec.tsx
related:
  issues: [5]
  requirements:
    - REQ-WEB-001
    - REQ-WEB-002
    - REQ-USER-002
    - REQ-USER-003
  adrs:
    - "012"
---

# REQ-WEB-003 — S'inscrire et se connecter depuis les pages d'authentification

## Contexte

Les deux pages sont traitées par une seule exigence parce qu'elles partagent
tout ce qui compte : le même markup, la même gestion d'erreurs, le même effet —
ouvrir une session. Les séparer aurait dupliqué six critères pour une différence
d'un champ.

AC-3 est le critère qui matérialise la promesse du modèle partagé côté
utilisateur : le formulaire refuse un email malformé avec **la règle même** que
l'API appliquerait. Ce n'est pas une validation « en double » mais la même
validation exécutée plus tôt — et si la règle change dans `packages/shared`, les
deux bougent ensemble. Un front qui réimplémenterait ses propres règles
afficherait un jour « email invalide » sur une adresse que l'API accepte, ou
l'inverse.

AC-5 prolonge côté interface une décision prise côté API
([REQ-USER-003](../user/REQ-USER-003.md) AC-3) : l'API répond volontairement la
même chose pour un email inconnu et un mot de passe erroné, afin de ne pas
devenir un oracle d'existence de comptes. Un front qui afficherait « ce compte
n'existe pas » sur un 401 rouvrirait la fuite que l'API a fermée — la propriété
ne tient que si les deux bouts la respectent.

## Règles

- Routes : `/register` et `/login` (PRD §5).
- Validation client : `registerUserDtoSchema` et `loginUserDtoSchema` de
  `@repo/shared` — aucune règle réécrite (rule 10).
- Affichage des erreurs : liste `.error-messages`, format §10 aplati en messages.
- Ces pages sont des **Client Components** : elles écrivent la session
  ([ADR 012](../../../adr/012-rendu-hybride-et-session-client.md)).
- Markup conforme au template RealWorld (rule 11) : on ne renomme pas les
  classes, on ne les remplace pas par des utilitaires maison.

## Hors périmètre

- La mise à jour du compte : [REQ-WEB-004](REQ-WEB-004.md).
- La persistance du jeton : [REQ-WEB-002](REQ-WEB-002.md).
- Toute règle de robustesse de mot de passe qui irait au-delà du modèle
  partagé : elle créerait un écart entre ce que le front refuse et ce que l'API
  accepte.
