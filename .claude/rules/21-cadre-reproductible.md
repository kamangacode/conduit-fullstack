# Cadre de développement reproductible

Ce repo n'est pas seulement une implémentation de la spec RealWorld : c'est une démonstration que le processus de développement peut être rendu **reproductible**. Les conventions ne vivent pas dans la tête d'une personne ni dans un historique de discussions dispersées — elles sont écrites, versionnées avec le code, et donc rejouables par n'importe quel contributeur qui les lit avant d'agir.

## Le cadre versionné comme source unique

Les règles de `.claude/rules/` sont la **source unique** des conventions du repo : commits, architecture, tests, sécurité, documentation. Elles vivent dans le même historique git que le code qu'elles gouvernent, donc elles évoluent avec lui plutôt que de dériver en silence.

- Une convention qui existe dans une rule ne se **redécrit pas** en prose ailleurs (PR description, commentaire de code, doc externe) : ça crée deux sources qui divergent tôt ou tard. On y renvoie par lien.
- Quand une convention change (ex : un nouveau pattern de test, une règle de sécurité affinée), la rule correspondante est éditée **avant** ou **avec** le changement de code qui l'illustre — jamais après, de mémoire.
- Un contributeur qui arrive sur ce repo sans contexte préalable doit pouvoir reconstruire les mêmes décisions qu'un contributeur qui l'a écrit, en lisant seulement `.claude/rules/` et les ADRs. C'est le test de la reproductibilité.

## Mémoire des décisions

Trois registres, trois granularités, pas de chevauchement :

- **ADRs** (`docs/adr/`) : décisions d'architecture. Choix de lib, pattern structurant, modèle de données, stratégie de déploiement. Une décision, un fichier, un numéro stable. Voir [03-commits-review.md](03-commits-review.md).
- **`artifacts/lessons.md`** : leçons post-incident. Un bug qui a échappé à la revue, un test qui s'est révélé tautologique, un footgun de câblage découvert en prod — capturé avec assez de contexte pour ne pas se reproduire à l'identique.
- **`.claude/memory/`** : contexte inter-sessions. Préférences validées, état du projet, références externes — ce qui permet de reprendre le fil sans tout redemander.

Chaque registre a un usage distinct : une décision d'architecture ne va pas dans les leçons, une leçon d'incident ne va pas dans un ADR. Le doute se tranche par la question « est-ce que je documente un **choix** (ADR), un **échec évité** (lessons) ou un **fait de contexte** (memory) ? ».

## Backlog d'amélioration continue

Un cycle de développement mature a toujours des manques mesurables (couverture d'un type de test, un contrôle de sécurité pas encore automatisé, une métrique de qualité pas encore suivie). La méthode pour en combler un, dans l'ordre :

1. **Prioriser** par effort/impact — ne pas prendre le manque le plus visible, prendre celui qui rapporte le plus pour l'effort le plus faible.
2. **Rattacher à une trace** : un REQ non-fonctionnel sans `implementation.tests` renseigné (voir [20-requirements-docs-as-code.md](20-requirements-docs-as-code.md)), ou un ADR qui documente pourquoi le manque existe encore.
3. **Démarrer en rapport non bloquant** sur un module pilote : le contrôle tourne, remonte un signal, mais ne bloque rien. Objectif : mesurer le bruit avant de gater.
4. **Calibrer** sur quelques itérations réelles (ajuster les seuils, éliminer les faux positifs).
5. **Bumper en gate** une fois calibré : le contrôle devient bloquant, avec un seuil qui a fait ses preuves plutôt qu'un seuil arbitraire posé au jour 1.

Sauter l'étape 3 (rapport non bloquant) est la cause la plus commune d'un gate désactivé six mois plus tard parce que trop bruyant.
