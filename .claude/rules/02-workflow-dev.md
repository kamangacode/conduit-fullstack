# Workflow de développement

## Point d'entrée unique

Toujours démarrer par `/dev #N` (numéro d'issue GitHub).

`/dev` orchestre toute la pipeline. Il ne faut **jamais** appeler directement `/spec`, `/plan` ou `/implement` en sautant le pipeline : ces appels manuels court-circuitent les gates intermédiaires et laissent l'issue mal cadrée.

## Pipeline par tier

Le pipeline se découpe en 5 phases : **Frame · Shape · Build · Verify · Ship**.

Selon le tier choisi à l'étape `frame`, certains steps sont skippés.

| Phase | Step | S | F-lite | F-full |
|---|---|---|---|---|
| Frame | `triage` (issue triée) | run | run | run |
| Frame | `frame` (cadrage) | skip | run + gate | run + gate |
| Shape | `analyze` (analyse technique) | skip | skip | run |
| Shape | `spec` (acceptance criteria) | skip | run + gate | run + gate |
| Build | `plan` (plan d'implémentation) | skip | run + gate | run + gate |
| Build | `implement` (code + tests) | run | run | run |
| Build | `pr` (création PR) | run | run | run |
| Verify | `ci-watch` (suivi CI) | cond | cond | cond |
| Verify | `validate` (lint, typecheck, tests) | run | run | run |
| Verify | `review` (code review) | run | run | run |
| Verify | `fix` (correction findings) | cond | cond | cond |
| Ship | `promote` | skip (standalone) | skip (standalone) | skip (standalone) |
| Ship | `cleanup` (worktree, branches) | cond | cond | cond |

**Légende** : `gate` = décision utilisateur obligatoire après le step · `cond` = exécuté seulement si conditions remplies (PR existe, findings présents, worktree stale).

### Quand choisir quel tier

- **S** : bug fix simple, typo, changement de config (≤3 fichiers, aucune décision d'architecture).
- **F-lite** : feature claire, scope limité à un domaine (ex : ajouter le tri par tag sur le feed), pas d'analyse technique préalable nécessaire.
- **F-full** : feature complexe, multi-domaine, ou impactant l'architecture (ex : pagination cursor-based partagée API + web). Déclenche l'étape `analyze`.

## Git worktrees obligatoires

```bash
git worktree add .claude/worktrees/XXX-slug -b feat/XXX-slug staging
```

Brancher sur `staging` (pas `main`). Un worktree par issue, jamais de travail multi-issues dans la même copie. `main` n'est alimenté que par la promotion `staging → main` (voir `15-deploiement-cicd.md`).

## Artifacts — mémoire de session

Avant d'implémenter, `/dev` crée les artifacts appropriés dans `artifacts/` :

| Artifact | Step | Format | Statut requis pour avancer |
|---|---|---|---|
| `artifacts/frames/{N}-{slug}-frame.md` | `frame` | frontmatter : `issue`, `tier`, `status` | `status: approved` |
| `artifacts/analyses/{N}-{slug}-analysis.md` | `analyze` | libre | présent (F-full uniquement) |
| `artifacts/specs/{N}-{slug}-spec.md` | `spec` | acceptance criteria | présent + gate validé |
| `artifacts/plans/{N}-{slug}-plan.md` | `plan` | items cochables | présent + gate validé |

Ces fichiers permettent à `/dev #N` de reprendre le travail sur n'importe quelle session interrompue : il scan l'état, en déduit le prochain step, et reprend.

## Garde-fous

- **Ne jamais** invoquer `/spec`, `/plan` ou `/implement` directement sur une issue : passer toujours par `/dev #N`.
- **Ne jamais** merger une PR sans que la phase `Verify` (validate + review) soit passée au vert.
- Toute décision architecturale non triviale émergeant en cours de pipeline se documente en ADR (voir `03-commits-review.md`).
