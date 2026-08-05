---
id: REQ-ERROR-002
title: Renvoyer les messages d'erreur exigés par la suite de conformité
type: functional
domain: error
status: approved
priority: must
source: "PRD §10 (erreurs) et §15.1 (suite Hurl, source de vérité du contrat) ; assertions de errors_auth.hurl, errors_articles.hurl, errors_comments.hurl, errors_profiles.hurl, errors_authorization.hurl"
acceptance_criteria:
  - id: AC-1
    given: "un champ obligatoire du contrat reçu vide ou absent — username, email, password, titre, description, corps d'article, corps de commentaire"
    when: "la requête est validée"
    then: "le premier message renvoyé pour ce champ est exactement `can't be blank`, et jamais un message par défaut de la bibliothèque de validation"
  - id: AC-2
    given: "un email reçu à la chaîne vide"
    when: "la requête est validée"
    then: "le message est `can't be blank` et non un motif de format — un champ vide est vide avant d'être malformé, et le contrôle de format ne doit pas passer devant"
  - id: AC-3
    given: "une requête sur une route protégée sans en-tête `Authorization` exploitable"
    when: "le guard la refuse"
    then: "la réponse est un 401 portant `{ errors: { token: [\"is missing\"] } }`"
  - id: AC-4
    given: "une requête portant un jeton présent mais invalide, expiré, ou dont le sujet ne résout plus vers un compte"
    when: "le guard la refuse"
    then: "la réponse est un 401 portant `{ errors: { token: [\"is invalid\"] } }` — le même message pour les trois causes, de sorte que rien ne renseigne le porteur sur l'état de son jeton"
  - id: AC-5
    given: "une tentative de connexion dont l'email est inconnu ou le mot de passe erroné"
    when: "elle est refusée"
    then: "la réponse est un 401 portant `{ errors: { credentials: [\"invalid\"] } }`, identique dans les deux cas"
  - id: AC-6
    given: "un utilisateur authentifié qui tente de modifier ou supprimer un article, ou de supprimer un commentaire, qui ne lui appartient pas"
    when: "la requête est refusée"
    then: "la réponse est un 403 dont le message est exactement `forbidden`, sous la clé `article` ou `comment` selon la ressource"
implementation:
  files: []
  tests: []
related:
  issues: [8]
  requirements:
    - REQ-ERROR-001
    - REQ-AUTH-001
    - REQ-USER-003
  adrs: ["008", "016", "017"]
---

# REQ-ERROR-002 — Renvoyer les messages d'erreur exigés par la suite de conformité

## Contexte

La première exécution de la suite officielle (ADR 016) contre `apps/api` a
produit **29 assertions en échec sur 84 requêtes**, et le détail de leur
répartition est l'information la plus utile de cette exigence : aucune ne portait
sur un parcours métier. `articles`, `comments`, `favorites`, `feed`,
`pagination`, `profiles` et `tags` passaient intégralement du premier coup.
Toutes portaient sur la **forme des erreurs**.

Autrement dit : le comportement était juste, et le contrat était trahi sur le
seul chemin que personne ne regarde en développant — celui du refus.

Trois causes distinctes se cachaient derrière ces 29 lignes, et chacune est un
mode d'échec réutilisable ailleurs :

1. **Les messages par défaut de la bibliothèque de validation partaient au
   client.** Un client recevait `Too small: expected string to have >=1
   characters`. Ce n'est pas une faute de frappe, c'est une fuite d'abstraction :
   le contrat d'erreur de l'API était de fait celui de Zod, et changer de
   bibliothèque de validation aurait changé le contrat externe.
2. **Les clés d'erreur étaient plausibles mais fausses** — `authorization` pour
   `token`, `email or password` pour `credentials`. Plausibles est le mot
   important : rien dans une relecture ne les signale, seul le contrat tranche.
3. **Les messages de permission étaient les nôtres** (`is not yours to modify`),
   là où le contrat en attend un seul, identique pour l'article et le
   commentaire.

REQ-ERROR-001 avait posé la *forme* de l'enveloppe. Celle-ci pose son *contenu*,
et c'est la partie qu'on ne peut pas déduire — seulement lire dans la suite.

## Règles

- Les chaînes sont définies une fois dans `packages/shared`
  ([ADR 017](../../../adr/017-messages-du-contrat-dans-shared.md)) et consommées
  par les schémas de validation comme par les erreurs de domaine.
- **Le vide se contrôle avant le format** (AC-2). Un email à la chaîne vide doit
  répondre `can't be blank`, pas un motif de format. L'ordre des contrôles est
  donc une propriété observable, pas un détail d'implémentation.
- Le refus d'authentification **distingue l'absence de la présence invalide**
  (AC-3 / AC-4), et **ne distingue pas** les trois causes d'invalidité entre
  elles. La première distinction ne renseigne l'appelant sur rien qu'il ne sache
  déjà — il sait s'il a envoyé un jeton. La seconde le renseignerait sur l'état
  de son jeton, et reste donc fermée.
- Le refus d'identifiants reste indistinct entre email inconnu et mot de passe
  erroné (AC-5), ce qui prolonge REQ-USER-003 AC-3 : c'est la même propriété,
  seul le libellé change.

## Hors périmètre

- Les messages que la suite officielle **n'assert pas** — le motif d'un email
  malformé non vide, par exemple. Ils restent choisis par nous et ne sont pas
  contractuels.
- L'exécution de la suite elle-même et le contrôle de dérive de la copie
  vendorée : [REQ-CONF-001](../../non-functional/conformance/REQ-CONF-001.md).
- La normalisation d'un champ nullable reçu vide, qui est un comportement de
  persistance et non un message : [REQ-USER-005](../user/REQ-USER-005.md).
- L'affichage de ces messages dans les formulaires de `apps/web`, déjà couvert
  par les exigences du domaine `web`.
