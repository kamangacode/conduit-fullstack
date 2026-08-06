---
id: REQ-USER-005
title: Traiter un champ nullable reçu vide comme une absence
type: functional
domain: user
status: implemented
priority: must
source: "PRD §7.1 (mise à jour du compte) ; assertions de auth.hurl (« Update user bio to empty string - should normalize to null »)"
acceptance_criteria:
  - id: AC-1
    given: "un compte dont la bio porte une valeur"
    when: "une mise à jour envoie `bio` à la chaîne vide"
    then: "la réponse porte `bio: null`, et non la chaîne vide"
  - id: AC-2
    given: "la même mise à jour"
    when: "le compte est relu par un appel ultérieur"
    then: "`bio` vaut toujours `null` — la normalisation est persistée, pas seulement appliquée à la réponse"
  - id: AC-3
    given: "un compte portant une image"
    when: "une mise à jour envoie `image` à la chaîne vide, puis que le compte est relu"
    then: "`image` vaut `null` dans la réponse comme à la relecture, exactement comme `bio`"
  - id: AC-4
    given: "une mise à jour qui omet `bio` et `image`"
    when: "elle est appliquée"
    then: "les deux champs conservent leur valeur — omettre un champ reste distinct de l'envoyer vide, et la normalisation ne doit pas effacer ce qu'on n'a pas touché"
  - id: AC-5
    given: "un champ obligatoire — `username` ou `email` — envoyé à la chaîne vide"
    when: "la mise à jour est validée"
    then: "elle est refusée par un 422 : la normalisation du vide ne vaut que pour les champs que le contrat déclare nullables"
implementation:
  files:
    - packages/shared/src/model/contract-fields.ts
    - packages/shared/src/model/user.ts
  tests:
    - packages/shared/src/errors/contract-messages.spec.ts
    - apps/api/test/integration/auth-http.integration.spec.ts
related:
  issues: [10]
  requirements:
    - REQ-USER-004
    - REQ-ERROR-002
  adrs: ["004", "017"]
---

# REQ-USER-005 — Traiter un champ nullable reçu vide comme une absence

## Contexte

Le contrat distingue trois intentions sur un champ nullable, et une
implémentation naïve n'en voit que deux :

- **omettre** le champ — ne pas y toucher ;
- l'envoyer à **`null`** — l'effacer ;
- l'envoyer à la **chaîne vide** — que la suite officielle traite comme un
  effacement, au même titre que `null`.

C'est la troisième qui manquait. `apps/api` persistait la chaîne vide telle
quelle, ce qui produit un état que le contrat ne prévoit pas : un compte dont la
bio vaut `""` alors que le modèle partagé annonce `string | null`. Le symptôme
est discret — la réponse reste bien formée, seul le contenu diffère — et il
remonte côté client sous forme d'un avatar ou d'une bio qui s'affiche « vide mais
présente » là où le repli aurait dû jouer.

Ce n'est pas une règle nouvelle dans ce dépôt : `apps/web` l'appliquait déjà
depuis la slice F4b, où `lib/avatar.ts` traite la chaîne vide comme une absence
précisément parce que le formulaire de paramètres envoie `''` à l'effacement.
Les deux applications avaient donc deux lectures du même champ, et seule celle du
front était juste. L'ADR 017 remonte la règle dans le contrat partagé, d'où elle
vaut pour les deux.

AC-4 et AC-5 sont là pour empêcher la correction de déborder. AC-4 : une
normalisation qui écrase aussi les champs omis transformerait chaque
enregistrement de formulaire en effacement partiel — c'est exactement le défaut
que la slice F4 avait fermé côté web pour le mot de passe. AC-5 : appliquer la
même indulgence à `username` ou `email` créerait un compte sans nom, là où le
contrat exige un refus.

## Règles

- La normalisation vit dans le **schéma partagé** de mise à jour du compte, donc
  en amont du domaine ([ADR 017](../../../adr/017-messages-du-contrat-dans-shared.md)).
  Le domaine continue de ne voir que deux cas — absent ou `null` — et n'a pas à
  connaître la troisième forme.
- Elle ne s'applique qu'aux champs que le contrat déclare **nullables**
  (`bio`, `image`). Un champ obligatoire reçu vide reste un 422 (AC-5,
  et [REQ-ERROR-002](../error/REQ-ERROR-002.md) AC-1).
- La distinction absent / vide / `null` doit rester lisible dans le type : c'est
  elle qui empêche de confondre « ne pas modifier » et « effacer ».

## Hors périmètre

- Le message d'erreur produit par un champ obligatoire vide, qui relève de
  [REQ-ERROR-002](../error/REQ-ERROR-002.md).
- Les autres champs nullables du modèle, s'il en apparaissait : cette exigence
  couvre `bio` et `image`, seuls champs nullables du compte à ce jour.
