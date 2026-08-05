# ADR 008 — Permission manquante : 403 conforme au contrat, plutôt que 404

## Status

Accepted — 2026-08-05. Amende [`.claude/rules/19-securite.md`](../../.claude/rules/19-securite.md)
(section « Anti-IDOR ») sur le code de retour, sans toucher au reste de la règle.

## Context

Deux consignes du dépôt se contredisent sur un point précis, et la contradiction
devait être tranchée avant d'écrire le mapping `DomainError → HTTP` de la slice
F2 — c'est ce mapping qui décidera, pour toutes les slices suivantes, du code
renvoyé quand une ressource existe mais n'appartient pas à l'appelant.

- **Rule 19 (Anti-IDOR)** : renvoyer **404, pas 403**. Un 403 confirme
  l'existence de la ressource à qui n'y a pas droit ; un 404 ne divulgue rien.
- **PRD §10** : **403 Forbidden** pour une « requête valide mais permission
  manquante (ex : éditer l'article d'un autre) ».

La contradiction n'est pas théorique : la suite de conformité Hurl officielle
(PRD §15, item F7) est le juge du contrat externe, et le gate de la Phase F exige
qu'elle passe. Un choix qui ferait échouer cette suite bloquerait la phase.

Il faut aussi noter ce qui rend le raisonnement de la rule 19 inopérant *sur ce
domaine précis* : dans Conduit, les articles et les commentaires sont
**publiquement lisibles sans authentification** (`GET /api/articles/:slug` ne
demande aucun jeton). L'existence d'un article n'est donc pas une information
protégée — c'est une information publiée.

## Options Considered

| Option | Trade-off |
|---|---|
| **403, conforme au PRD (retenue)** | Le contrat externe est respecté, la suite Hurl passe. Sur ce domaine, le 403 ne divulgue rien qu'un `GET` anonyme ne donne déjà. Coût : la rule 19 doit être amendée, sinon le dépôt porte une consigne que son code viole. |
| 404, conforme à la rule 19 | Posture de sécurité maximale et uniforme dans tout le dépôt. Écartée : la suite de conformité officielle attend un 403 sur l'édition de l'article d'autrui, donc ce choix ferait échouer le gate de la Phase F pour un gain de confidentialité **nul** sur des ressources déjà publiques. |
| 404 par défaut, 403 sur les ressources publiques | Conceptuellement le plus juste : le code dépend de la sensibilité réelle de la ressource. Écartée pour ce dépôt : la règle nuancée demande, à chaque nouvelle ressource, un jugement sur son caractère public — c'est le type de règle qu'on applique correctement six mois, puis de travers. |

## Decision

Sur une **permission manquante**, l'API renvoie **403 Forbidden**, conformément
au PRD §10. Sur une ressource **inexistante**, elle renvoie 404.

Cette décision porte sur le **code de retour** et sur lui seul. Le reste de la
section Anti-IDOR de la rule 19 reste intégralement en vigueur, et c'est la
partie qui compte réellement pour la sécurité :

- l'appartenance est vérifiée **dans la requête SQL** (`WHERE id = ? AND authorId = ?`),
  jamais par un `findById` suivi d'une comparaison en mémoire ;
- l'identité de l'appelant vient toujours du jeton vérifié, jamais du corps de la
  requête (server-side authority).

Autrement dit : ce qui change est ce que l'API *dit*, pas ce qu'elle *vérifie*.

La rule 19 est amendée pour porter cette exception et sa justification, afin que
le dépôt ne contienne pas une consigne que son propre code contredit.

## Consequences

### Positive

- La suite de conformité Hurl peut passer, donc le gate de la Phase F reste
  atteignable.
- Le contrat externe de ce dépôt reste identique à celui de la spine Java : c'est
  précisément la comparaison que le projet veut rendre possible.
- La contradiction est tranchée **une fois**, avant l'écriture du mapping, plutôt
  que redécouverte à chaque slice.

### Negative

- Le dépôt renonce à la posture 404 uniforme, plus défensive par principe. Sur un
  domaine où les ressources ne seraient pas publiques, ce choix serait mauvais —
  il n'est justifié que par le caractère public des articles et commentaires de
  Conduit.
- Un lecteur qui découvre la rule 19 sans lire cet ADR pourrait croire la règle
  inchangée. C'est pourquoi l'amendement est écrit dans la rule elle-même, avec
  un lien vers ici, plutôt que laissé implicite.

### Neutral

- Aucune conséquence sur la slice F2 elle-même : auth et profils ne comportent
  aucune opération d'édition de ressource d'autrui. La décision est prise
  maintenant parce que F2 construit le mapping d'erreurs, mais elle ne
  s'appliquera concrètement qu'à partir de F3 (articles et commentaires).
- Le cas « ressource inexistante » (404) et le cas « non authentifié » (401)
  ne sont pas affectés.
- Si le périmètre du projet s'étendait un jour à des ressources non publiques
  (messages privés, brouillons), cet ADR devrait être réexaminé — c'est la
  publicité des ressources qui le fonde, pas une préférence générale.
