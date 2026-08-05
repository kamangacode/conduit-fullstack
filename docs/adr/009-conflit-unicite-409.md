# ADR 009 — Violation d'unicité : 409 Conflict plutôt que 422

## Status

Accepted — 2026-08-05. Même classe de question que
[008 — Permission manquante](008-permission-manquante-403.md), tranchée
séparément : les deux décisions portent sur des situations distinctes et rien ne
justifie qu'un changement d'avis sur l'une entraîne l'autre.

## Context

La règle **R-8** (PRD §11) impose l'unicité de `email` et `username`. La slice F2
doit donc décider ce que renvoie l'API quand une inscription — ou une mise à jour
de compte — heurte cette contrainte.

Les sources du dépôt se contredisent :

- [`openapi.yml`](../../../coaching-craft/03-produits/produits-conduit/github/prd/specifications/backend/openapi.yml)
  déclare explicitement `409 → ConflictError` sur `POST /users` (et sur
  `POST /articles` pour le slug).
- `error-handling.md` et le tableau du **PRD §10** ne listent que 401, 403, 404 et
  422, et rattachent 422 à « tout échec de validation ».

Le corps de réponse, lui, ne fait pas débat : `ConflictError` réutilise le même
`GenericErrorModel` que l'erreur 422, avec l'exemple
`{"errors":{"username":["has already been taken"]}}`. La divergence se réduit
donc à un **code de statut**, à corps identique.

La décision devait être prise avant d'écrire le mapping `DomainError → HTTP`,
qui sera repris tel quel par la slice F3 (conflit de slug d'article).

## Options Considered

| Option | Trade-off |
|---|---|
| **409, conforme à `openapi.yml` (retenue)** | Sémantiquement juste : un email déjà pris n'est pas une charge utile malformée, c'est un conflit avec l'état du serveur. C'est aussi la seule des deux sources à traiter le cas **explicitement**, plutôt que par défaut. Coût : écart avec le tableau du PRD §10, à consigner. |
| 422 | Ce que renvoie l'implémentation de référence Rails, donc ce que la plupart des clients RealWorld tolèrent le mieux. Écartée : elle range sous « échec de validation » une condition qu'aucun schéma ne peut vérifier, puisqu'elle demande d'interroger la base. |
| Trancher plus tard, en F7 | Implémenter 422 et réévaluer quand la suite Hurl tournera. Écartée : le mapping serait écrit deux fois, et un REQ marqué `implemented` affirmerait un comportement provisoire. |

## Decision

Une violation d'unicité renvoie **409 Conflict**, avec le corps `GenericErrorModel`
commun : `{"errors":{"<champ>":["has already been taken"]}}`.

Cela couvre l'inscription (`POST /api/users`) et la mise à jour de compte
(`PUT /api/user`) lorsqu'elle vise un email ou un username déjà porté par **un
autre** utilisateur. Reprendre sa propre valeur n'est pas un conflit.

Le 422 reste le code de tout ce qu'un schéma Zod peut refuser seul : champ
manquant, email malformé, mot de passe trop court. La frontière est nette et
mécanique — **si la validation exige un accès à la base, c'est 409 ; sinon,
c'est 422**.

La détection s'appuie sur la contrainte `@unique` de PostgreSQL, pas sur un
`SELECT` préalable : entre la lecture et l'écriture, un second appel concurrent
peut insérer la même valeur. C'est la base qui arbitre, et l'adapter traduit la
violation de contrainte en erreur de domaine.

## Consequences

### Positive

- Le client distingue « ta requête est mal formée » de « ta requête est bien
  formée mais l'état du serveur s'y oppose », sans inspecter le corps.
- La règle de frontière (accès base ⇒ 409) est mécanique, donc applicable sans
  jugement à chaque nouveau cas — à commencer par le slug d'article en F3.
- S'appuyer sur la contrainte SQL plutôt que sur un `SELECT` préalable ferme la
  fenêtre de course, qui est le mode de panne classique de cette vérification.

### Negative

- Écart avec l'implémentation de référence Rails : un client RealWorld tiers qui
  traiterait spécifiquement le 422 d'inscription verrait un code inattendu. Le
  corps identique limite la casse, mais ne l'annule pas.
- Si la suite de conformité Hurl (F7) asserte un 422 sur ce cas, cet ADR devra
  être amendé et le mapping corrigé. Le risque est assumé : il est concentré en
  un seul point du code, précisément pour que la correction soit locale.

### Neutral

- Aucun impact sur les autres codes : 401, 403 (voir [008](008-permission-manquante-403.md)),
  404 et 422 gardent leur sens.
- Le message `has already been taken` est repris verbatim de l'exemple
  `openapi.yml`, pour maximiser la compatibilité avec les clients qui affichent
  le message tel quel.
