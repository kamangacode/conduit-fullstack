# ADR 003 — Mises à jour de dépendances : Dependabot

## Status

Accepted — 2026-08-04.

## Context

Un dépôt qui n'automatise pas ses montées de version accumule une dette de
sécurité et de compatibilité silencieuse : les CVE s'empilent, et le jour où une
montée devient urgente, l'écart à combler est énorme. Il faut un flux régulier,
groupé et cadencé de PRs de mise à jour, plus un filet de sécurité qui détecte
les vulnérabilités des versions déjà installées.

## Options Considered

| Option | Trade-off |
|---|---|
| **Dependabot (retenue)** | Natif GitHub (zéro infra, zéro app à installer), config `dependabot.yml` déclarative : groupes, cooldown, blocage des majeurs. Cohérent avec les autres dépôts. Grouping et scheduling moins fins que Renovate. |
| Renovate | Plus puissant (règles d'automerge, dashboard, grouping très fin, scheduling avancé), mais demande d'installer et d'autoriser l'app GitHub Renovate — une dépendance externe de plus pour un dépôt vitrine. |
| Rien (montée manuelle) | Zéro outil, mais la dette s'accumule et les montées deviennent des chantiers. Écarté. |

## Decision

**Dependabot**, configuré dans `.github/dependabot.yml` :

- Deux écosystèmes : `npm` (monorepo) et `github-actions` (workflows).
- **Groupes** : `prisma`, `nestjs`, `next-react`, `tanstack`, `tooling`, et un
  `minor-and-patch` fourre-tout — pour recevoir peu de PRs cohérentes plutôt que
  beaucoup de PRs isolées.
- **Cooldown** croissant avec le risque (patch 7j, minor 14j, major 30j) : ne pas
  intégrer une version publiée il y a une heure.
- **Majeurs bloqués** sur les packages critiques (Prisma, NestJS, Next, React) :
  une montée majeure est une décision manuelle, jamais une PR automatique.

Complété par un **job CI `audit`** (`pnpm audit --prod --audit-level=high`) qui
tourne sur le cron hebdomadaire et à chaque changement de lockfile — le filet qui
attrape une CVE sur une dépendance déjà installée, que Dependabot ne verrait que
lorsqu'un correctif est publié.

Renovate reste un candidat de **banc d'essai** en Phase 5 (Partie B) pour un
article comparatif : le cas échéant, les deux configs coexisteront comme deux
fichiers réels.

## Consequences

### Positive
- Flux régulier et groupé de montées, cadencé par le cooldown.
- Aucune infrastructure ni app tierce à maintenir.
- Le job `audit` couvre l'angle mort de Dependabot (vulnérabilités des versions déjà en place).

### Negative
- Grouping et automerge moins expressifs que Renovate (pas d'automerge conditionnel natif ici).
- Les majeurs critiques demandent une intervention manuelle (choix assumé).

### Neutral
- Le job `audit` est volontairement hors du check requis `ci-success` : c'est un
  signal de sécurité, pas un gate qui bloquerait une PR sans rapport à cause d'une
  CVE transitive.
