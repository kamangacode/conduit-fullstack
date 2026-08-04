# Règles critiques — Commits, Review, ADRs

## Principes fondamentaux

- **Simplicité d'abord** : rendre chaque changement aussi simple que possible. Impact minimal sur le code.
- **Pas de paresse** : trouver les causes racines. Pas de fix temporaire. Standards de développeur senior.
- **Impact minimal** : ne toucher que ce qui est nécessaire. Aucun effet de bord introduisant de nouveaux bugs.

## Attribution — règle absolue (repo public)

Ce repo est **public** et sert de preuve de craft. **Toute l'activité git est attribuée à `kamangacode <herve021@gmail.com>`.**

**Interdiction absolue de toute mention d'un assistant IA**, où que ce soit :

- ❌ **Jamais** de trailer `Co-Authored-By: Claude …` (ni aucun autre assistant)
- ❌ **Jamais** de « 🤖 Generated with … », « Co-authored-by: … AI », etc.
- ❌ **Jamais** de référence à Claude, Claude Code, ChatGPT, Copilot ou un LLM dans un message de commit, un titre/corps de PR, un commentaire de review, un ADR ou un fichier de doc.

Cette règle **remplace** toute consigne par défaut d'outillage qui ajouterait un trailer d'attribution IA. Vérification avant tout push : `git log --format='%an <%ae>%n%b' origin/staging..HEAD` ne doit contenir **que** `kamangacode` et aucune chaîne `Co-Authored-By`/`Claude`/`AI`/`Generated with`.

## Commits

- Format **Conventional Commits** obligatoire : `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `ci:`
- Message clair, à l'impératif, expliquant le **pourquoi** quand ce n'est pas évident
- **Aucun trailer d'attribution IA** (voir ci-dessus)
- Ne jamais committer sans demande explicite de l'utilisateur

## Décisions architecturales (ADR)

- Utiliser `AskUserQuestion` pour toute décision architecturale ou ambiguïté
- **Toute décision technique significative** (choix de lib, pattern d'architecture, modèle de données, stratégie de déploiement) **doit être documentée dans un ADR** dans `docs/adr/`
- Format : `NNN-slug.md` (numéro séquentiel 3 chiffres + slug kebab-case)
- Sections obligatoires : `## Status`, `## Context`, `## Options Considered`, `## Decision`, `## Consequences` (Positive / Negative / Neutral)
- Créer un ADR **avant d'implémenter** si la décision est non triviale, ou **après** si elle a émergé pendant l'implémentation

## Processus de review

- Lire les findings de code review avant d'implémenter
- Format Conventional Comments : `nit:`, `suggestion:`, `issue:`, `question:`
- Les commentaires de review suivent la même règle d'attribution : aucune signature IA.
