---
id: REQ-WEB-017
title: Rendre lisible l'échec d'une soumission, y compris sans réponse de l'API
type: functional
domain: web
status: implemented
priority: must
source: "PRD §10 (contrat d'erreur) ; suite e2e officielle `error-handling.spec.ts`"
acceptance_criteria:
  - id: AC-1
    given: "un formulaire soumis alors que le serveur est injoignable"
    when: "la requête échoue sans qu'aucune réponse ne revienne"
    then: "la liste `.error-messages` porte un message d'échec de connexion, et le formulaire reste utilisable"
  - id: AC-2
    given: "une réponse d'erreur de l'API portant des messages par champ (§10)"
    when: "elle est traduite pour l'affichage"
    then: "ce sont ces messages qui s'affichent — le message d'échec de connexion ne les remplace pas"
  - id: AC-3
    given: "une réponse d'erreur sans message exploitable"
    when: "elle est traduite pour l'affichage"
    then: "le message générique fourni par la page pour ce statut s'affiche, et non le message d'échec de connexion"
  - id: AC-4
    given: "les formulaires de connexion, d'inscription, de paramètres, d'édition d'article et de commentaire"
    when: "l'un d'eux subit un échec de transport"
    then: "tous rendent le même message, issu d'une source unique — aucun ne porte sa propre formulation"
implementation:
  files:
    - apps/web/src/lib/errors.ts
    - apps/web/src/components/CommentSection.tsx
  tests:
    - apps/web/src/lib/errors.spec.ts
    - apps/web/src/components/AuthForm.spec.tsx
    - apps/web/src/components/SettingsForm.spec.tsx
    - apps/web/src/components/ArticleEditor.spec.tsx
    - apps/web/src/components/CommentSection.spec.tsx
related:
  issues: [11, 12]
  requirements:
    - REQ-WEB-003
    - REQ-WEB-004
    - REQ-WEB-013
    - REQ-WEB-014
  adrs:
    - "017"
---

# REQ-WEB-017 — Rendre lisible l'échec d'une soumission, y compris sans réponse de l'API

## Contexte

Le contrat §10 décrit ce que l'API répond quand elle refuse quelque chose. Il ne
décrit pas — et ne peut pas décrire — le cas où **rien ne revient** : réseau
coupé, DNS muet, serveur arrêté. C'est pourtant le seul échec que l'utilisateur
peut parfois corriger lui-même, et celui où un formulaire silencieux est le plus
coûteux : il vient d'écrire un article, il clique, rien ne bouge, et il ne sait
pas s'il doit recommencer.

Le dépôt traduit déjà ces échecs (`lib/errors.ts`), et la fonction porte
justement la trace d'une dérive passée : chaque formulaire avait sa copie, et les
copies avaient divergé. AC-4 est ce qui rend cette source unique **opposable**
plutôt que simplement documentée.

AC-2 et AC-3 tracent la frontière que le message d'échec de connexion ne doit pas
franchir. Une API qui répond « email is already taken » a répondu : substituer
« impossible de joindre le serveur » ferait chercher une panne réseau à
quelqu'un dont le seul problème est un email déjà pris.

## Règles

- Le message d'échec de transport est **le nôtre**, pas celui du contrat : il ne
  vient d'aucune réponse d'API, donc il ne va pas dans `@repo/shared`
  ([ADR 017](../../../adr/017-messages-du-contrat-dans-shared.md) ne couvre que
  les messages que l'API émet).
- Sa formulation est fixée par la suite e2e officielle, qui l'assert
  littéralement — au même titre qu'un sélecteur
  ([REQ-WEB-007](REQ-WEB-007.md)). La reformuler « pour le ton » casse la suite
  sans rien casser dans l'application.
- Le formulaire reste utilisable après l'échec : la saisie est conservée, le
  bouton redevient actionnable. Un échec de transport est par nature transitoire.

## Hors périmètre

- L'état de session quand c'est la réhydratation du démarrage qui échoue, et non
  une soumission : [REQ-WEB-016](REQ-WEB-016.md).
- Le contenu des messages émis par l'API : ils viennent de `@repo/shared`
  ([REQ-ERROR-002](../error/REQ-ERROR-002.md)).
- Le rejeu automatique d'une soumission échouée : le contrat ne porte aucune clé
  d'idempotence côté écriture (item C4, Phase 4), donc rejouer risquerait un
  doublon.
