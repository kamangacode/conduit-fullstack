# ADR 006 — Couverture de tests : artefact de CI, sans service externe

## Status

Accepted — 2026-08-05.

## Context

Le harness de tests par couche (item C1) produit un rapport de couverture par
workspace (`apps/api`, `apps/web`, `packages/shared`). Reste à décider où ce
rapport est lu et par qui.

Le plan d'outillage prévoyait initialement Codecov, avec des flags `unit` /
`integration`. Codecov apporte le suivi de tendance, un badge et des
commentaires automatiques de PR — mais c'est un service tiers : compte à créer,
`CODECOV_TOKEN` à poser dans les secrets du dépôt, et une dépendance de plus
dans la chaîne de CI d'un dépôt qui sert de vitrine.

Le dépôt a par ailleurs déjà tranché dans le même sens pour la matrice de
traçabilité ([ADR 005](005-matrice-de-tracabilite-generee.md)) : pas de service
externe, pas d'écriture depuis la CI.

## Options Considered

| Option | Trade-off |
|---|---|
| **Artefact de CI + résumé de run (retenue)** | Zéro dépendance externe, zéro secret, zéro compte. La synthèse s'affiche dans le résumé du run (donc lisible depuis la PR) et le rapport `lcov` complet part en artefact téléchargeable. En contrepartie : pas de badge, pas de commentaire automatique, pas de tendance historique. |
| Codecov, upload conditionné au secret | Aurait donné badge et tendance dès la pose du token, sans rien casser en attendant. Mais laisse dans le dépôt une étape de CI inerte, qui décrit une intention plutôt qu'un fonctionnement — et une config qui n'a jamais tourné n'est pas une preuve de craft. |
| Codecov immédiat | Bloque la CI tant que le secret n'est pas posé. Écartée. |

## Decision

Chaque workspace produit sa couverture via `pnpm test:coverage` (reporters
`text-summary`, `json-summary`, `lcov`). Le job CI `Test` exécute
`pnpm test:coverage` — les mêmes tests, instrumentés, plutôt qu'une seconde
exécution — puis :

- publie la synthèse par workspace dans `$GITHUB_STEP_SUMMARY` via
  [`scripts/coverage-summary.sh`](../../scripts/coverage-summary.sh) ;
- téléverse les rapports complets en artefact (rétention 14 jours).

**Aucun seuil bloquant** n'est posé à ce stade. Un seuil défini sur une surface
quasi vide ne mesure rien et sera contourné au premier commit gênant ; il sera
calibré sur des données réelles, puis rendu bloquant (rule 21, item A5 —
coverage ratchet).

## Consequences

### Positive

- Aucun secret, aucun compte, aucune dépendance tierce dans la chaîne de CI.
- La couverture reste lisible depuis une PR, sans quitter GitHub.
- La commande locale (`pnpm test:coverage && pnpm coverage:summary`) donne
  exactement le même tableau que la CI — pas de vérité réservée au serveur.

### Negative

- Pas de suivi de tendance : impossible de dire « la couverture a baissé de 3
  points depuis la semaine dernière » sans comparer deux runs à la main.
- Pas de badge dans le README, ni de commentaire automatique de PR.
- Les artefacts expirent (14 jours) : l'historique de couverture n'existe pas.

### Neutral

- Le choix reste réversible : brancher Codecov plus tard ne demande qu'une étape
  d'upload supplémentaire, le format `lcov` étant déjà produit.
- La séparation des lanes (`test` rapide sans instrumentation, `test:coverage`
  instrumenté) est indépendante de cette décision et lui survivrait.
