# ADR 005 — Matrice de traçabilité : artefact généré, non versionné

## Status

Accepted — 2026-08-05.

## Context

La matrice de traçabilité exigence → test (`pnpm requirements:matrix`, item E3)
produit deux fichiers Markdown : `traceability-matrix.md` et `orphans.md`. Ils
sont entièrement **dérivés** de deux sources déjà versionnées — les REQ de
`docs/requirements/` et le nommage des `describe`/`it` des fichiers de test.

Un artefact dérivé pose toujours la même question : le committe-t-on ? S'il est
committé, il peut devenir périmé et affirmer une couverture qui n'existe plus —
le mensonge exact que le référentiel d'exigences est censé rendre impossible.
S'il ne l'est pas, il n'apparaît plus dans les diffs de PR.

La contrainte supplémentaire vient de `ci.yml`, qui pose `permissions: contents: read`
avec un parti pris explicite : « la CI lit, elle n'écrit pas ». La rule 20, écrite
avant, mentionnait une CI qui *commite* la matrice — les deux ne pouvaient pas
rester vrais.

## Options Considered

| Option | Trade-off |
|---|---|
| **Non versionné, généré à la demande (retenue)** | Aucun risque de péremption : le fichier n'existe que fraîchement calculé. `.gitignore` suffit, aucune permission d'écriture en CI, aucun commit de bot. En contrepartie la matrice n'est pas consultable sur GitHub et n'apparaît pas dans le diff d'une PR. |
| Committé + CI en mode `--check` | La matrice serait reviewable en PR, et un `--check` échouant sur un fichier périmé fermerait le risque de dérive. Mais chaque PR touchant un test produirait un diff d'artefact généré, bruit qui finit par être approuvé sans être lu. |
| Généré et committé par la CI | Lecture littérale de la rule 20 d'origine. Exige `contents: write` sur le job et produit des commits de bot sur `staging` — contredit frontalement le parti pris de `ci.yml`. Écartée. |

## Decision

`docs/requirements/_generated/` est dans `.gitignore`. La matrice et le rapport
d'orphelins se régénèrent avec `pnpm requirements:matrix`.

La CI ne les commite pas et n'échoue pas dessus : le job `Requirements` exécute
`pnpm requirements:coverage` et publie le tableau de couverture dans le
**résumé du run** (`$GITHUB_STEP_SUMMARY`). La couverture reste ainsi lisible
depuis une PR — sans fichier committé, sans permission d'écriture, et sans
qu'un chiffre non calibré bloque quoi que ce soit (rule 21 : on mesure avant de
gater).

La rule 20 est corrigée en conséquence : elle décrivait un job qui commitait ces
fichiers.

## Consequences

### Positive

- Un artefact dérivé ne peut pas être périmé s'il n'est jamais stocké.
- La CI conserve `permissions: contents: read` — aucun commit de bot dans
  l'historique d'un dépôt qui sert de preuve de craft.
- Les diffs de PR restent du code et des exigences, pas des tableaux régénérés.

### Negative

- La matrice n'est pas navigable sur GitHub : il faut cloner et lancer la
  commande. C'est le coût assumé de l'option retenue.
- Le résumé de run compense partiellement, mais il est éphémère (il disparaît
  avec la rétention des runs).

### Neutral

- Le générateur reste un **rapport**, jamais un gate. Le jour où un seuil de
  couverture AC-level sera calibré sur des données réelles, il pourra devenir
  bloquant — ce sera une décision distincte, à documenter dans son propre ADR.
- Si le besoin de consultation en ligne apparaît, publier la matrice comme
  artefact de run ou page statique reste possible sans revenir sur ce choix.
