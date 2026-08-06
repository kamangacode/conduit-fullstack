---
id: REQ-WEB-001
title: Consommer l'API par un client typé par le modèle partagé
type: functional
domain: web
status: implemented
priority: must
source: "PRD §7, §9, §10 ; architecture §5 et §6 (frontière de type)"
acceptance_criteria:
  - id: AC-1
    given: "une réponse de l'API"
    when: "elle est reçue par le client"
    then: "son type vient de `@repo/shared` — le client ne redéfinit aucun type Conduit et n'expose aucun `any` à ses appelants"
  - id: AC-2
    given: "un appel authentifié et un jeton en session"
    when: "la requête part"
    then: "elle porte l'en-tête `Authorization: Token <jwt>`, avec le préfixe `Token` et non `Bearer`"
  - id: AC-3
    given: "un appel sans jeton"
    when: "la requête part"
    then: "aucun en-tête d'autorisation n'est envoyé, et l'appel réussit sur les endpoints à authentification optionnelle"
  - id: AC-4
    given: "une réponse d'erreur au format §10"
    when: "le client la reçoit"
    then: "il lève une erreur qui porte le statut HTTP et les `errors` par champ, exploitables pour un affichage sous les champs de formulaire"
  - id: AC-5
    given: "une réponse 204 sans corps"
    when: "le client la reçoit"
    then: "il rend la main sans tenter de désérialiser du JSON"
implementation:
  files:
    - apps/web/src/lib/api-client.ts
    - apps/web/src/lib/api-provider.tsx
  tests:
    - apps/web/src/lib/api-client.spec.ts
related:
  issues: [7]
  requirements:
    - REQ-WEB-002
    - REQ-ERROR-001
    - REQ-AUTH-001
  adrs:
    - "012"
---

# REQ-WEB-001 — Consommer l'API par un client typé par le modèle partagé

## Contexte

C'est le fichier qui porte la thèse du dépôt. Le modèle Conduit est écrit **une
seule fois**, dans `packages/shared` ; `apps/api` le produit, `apps/web` le
consomme, et le compilateur TypeScript tient lieu de contrat — sans génération
de client, sans schéma externe à resynchroniser (architecture §6).

AC-1 est donc la garde de cette thèse, et elle se formule négativement : le
client ne **redéfinit** rien. Un `interface Article` recopié ici serait
indétectable à l'exécution et ferait diverger le front de l'API au premier champ
ajouté — exactement la dette que ce dépôt existe pour éviter.

AC-2 mérite un critère à lui seul parce que le préfixe est une singularité de la
spec : `Token`, pas `Bearer`. Toute bibliothèque HTTP configurée par habitude
enverra `Bearer`, l'API répondra 401, et le symptôme désignera l'authentification
plutôt que l'en-tête.

AC-5 protège un cas que la suppression d'article et de commentaire rendent
courant : un `204` n'a pas de corps, et `response.json()` sur un corps vide lève
une erreur de parsing qui n'a rien à voir avec la requête.

## Règles

- Types et schémas : `@repo/shared` uniquement ([REQ-USER-001](../user/REQ-USER-001.md),
  [REQ-ARTICLE-001](../article/REQ-ARTICLE-001.md)).
- En-tête d'authentification : `Authorization: Token <jwt>` (PRD §9).
- Format d'erreur : `{ errors: { champ: [messages] } }` (PRD §10,
  [REQ-ERROR-001](../error/REQ-ERROR-001.md)).
- Le client **n'interprète pas** les erreurs métier : il les transporte. Décider
  qu'un 422 s'affiche sous un champ est le travail du formulaire.
- Le jeton est injecté depuis la session ([REQ-WEB-002](REQ-WEB-002.md)), jamais
  lu directement dans `localStorage` par un appelant.

## Hors périmètre

- La persistance du jeton et la réhydratation : [REQ-WEB-002](REQ-WEB-002.md).
- Le cache et la déduplication des requêtes : rôle de TanStack Query, câblé par
  les pages, pas par ce client.
- La validation des entrées avant envoi : elle appartient aux formulaires, qui
  utilisent les mêmes schémas Zod que l'API.
