# Contribuer à conduit-fullstack

Merci de l'intérêt porté au projet. Ce dépôt est une **vitrine de craft** : chaque
garde-fou technique (config, hook, test, migration) y est un vrai fichier commenté,
pensé pour être lisible sans contexte additionnel. Les contributions sont bienvenues
dans cet esprit — la lisibilité et la traçabilité priment sur la vitesse.

## Prérequis

- **Node ≥ 20** (voir [`.nvmrc`](.nvmrc)), **pnpm 10**, **Docker**.
- Lire le [README](README.md) (« Démarrage rapide ») et, selon la zone touchée, les
  [ADR](docs/adr/) et [exigences](docs/requirements/) concernées.

## Cycle d'une contribution

1. **Une branche par sujet, depuis `staging`** (jamais depuis `main`) :

   ```bash
   git switch staging && git pull
   git switch -c feat/mon-sujet   # ou fix/, docs/, refactor/, test/, chore/, ci/
   ```

   `main` ne reçoit que des promotions depuis `staging`, jamais de développement direct.

2. **Écrire le code ET ses tests dans la même unité.** Les tests vivent à côté des
   sources (`*.spec.ts`). Le backend suit l'[architecture hexagonale](docs/adr/) : le
   `domain` reste pur (aucun import de framework), frontière vérifiée par
   `dependency-cruiser`.

3. **Tracer les décisions.** Une décision technique non triviale (choix de lib, pattern,
   modèle de données) se documente dans un [ADR](docs/adr/) — voir
   [`docs/adr/000-template.md`](docs/adr/000-template.md). Une exigence fonctionnelle se
   décrit dans [`docs/requirements/`](docs/requirements/) (frontmatter Zod, critères
   `AC-n` en Given/When/Then) et se rattache à ses tests par le nommage
   `describe('REQ-…')` / `it('AC-1: …')`.

## Avant de pousser — les mêmes portes que la CI

```bash
pnpm lint                    # Biome
pnpm typecheck               # TypeScript strict
pnpm test                    # tests unitaires (DB-free)
pnpm test:integration        # tests d'intégration (Postgres jetable)
pnpm knip                    # code mort
pnpm depcruise               # frontières hexagonales
pnpm requirements:validate   # intégrité du référentiel d'exigences
```

Un hook `pre-push` ([`lefthook.yml`](lefthook.yml)) rejoue lint + typecheck + tests +
migrations sur une base jetable : un rouge local est un rouge CI.

## Commits & pull requests

- **[Conventional Commits](https://www.conventionalcommits.org/)** obligatoires :
  `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`. Le scope est
  encouragé (`feat(api): …`).
- Une PR = un sujet cohérent, avec le [gabarit](.github/PULL_REQUEST_TEMPLATE.md) rempli
  (contexte, changements, comment tester). Elle cible **`staging`**.
- La revue suit les [Conventional Comments](https://conventionalcomments.org/) :
  `issue:` (bloquant), `suggestion:`, `question:`, `nit:`, `praise:`.

## Signaler un bug ou une faille

- Bug fonctionnel : ouvrir une issue via le [gabarit de bug](.github/ISSUE_TEMPLATE/).
- **Faille de sécurité** : ne PAS ouvrir d'issue publique — suivre la
  [politique de sécurité](SECURITY.md).

Les échanges sont régis par le [Code de conduite](CODE_OF_CONDUCT.md).
