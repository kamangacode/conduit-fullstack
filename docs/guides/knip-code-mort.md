# Guide — knip et la détection de code mort

> Comment lire la configuration `knip.json`, lancer la détection de code mort en
> local, et comprendre pourquoi le job Quality de la CI rougit dessus.
>
> Ce guide est le *comment s'en servir*. Le *pourquoi* (un monorepo doit prouver
> qu'un changement se propage, pas qu'une copie morte traîne) relève de
> [REQ-ARCH-001](../requirements/non-functional/architecture/REQ-ARCH-001.md),
> où `knip` est cité comme l'un des angles de couverture.

## Qu'est-ce que knip

**knip** est un outil d'analyse statique pour projets JS/TS qui traque le **code
mort** : fichiers jamais importés, exports jamais consommés, et dépendances de
`package.json` déclarées mais inutilisées (ou, à l'inverse, utilisées sans être
déclarées). C'est un « dépoussiéreur » de monorepo : là où le compilateur se tait
sur une classe orpheline, knip la signale.

Il part d'un ensemble de **points d'entrée** (`entry`), suit le graphe des
imports à partir d'eux, et déclare mort tout ce qui est dans le **périmètre**
(`project`) sans être atteint.

## Anatomie de `knip.json`

La config vit à la racine, un bloc par workspace pnpm. Extrait de
[`knip.json`](../../knip.json) :

```json
{
  "workspaces": {
    "apps/api": {
      "entry": ["src/**/*.module.ts", "src/**/*.controller.ts"],
      "project": ["src/**/*.ts"],
      "ignoreDependencies": ["@prisma/client"]
    }
  }
}
```

Les trois clés en jeu :

| Clé | Rôle |
|---|---|
| `entry` | Les fichiers d'où **part** l'analyse d'accessibilité. Tout ce qui n'est atteignable depuis aucune entrée est candidat au code mort. |
| `project` | Le **périmètre** analysé : les fichiers que knip a le droit de déclarer morts. |
| `ignoreDependencies` | Les dépendances chargées **implicitement** (jamais `import`-ées directement) qu'il ne faut pas signaler comme inutilisées. |

## Les points d'entrée, workspace par workspace

Le cœur de la config est le choix des `entry` : chaque framework « appelle » du
code par des mécanismes que l'analyse d'imports classique ne voit pas, et il faut
les déclarer manuellement sinon knip croit ce code mort.

| Workspace | `entry` | Pourquoi ces entrées |
|---|---|---|
| `.` (racine) | `scripts/**/*.sh` | Les scripts shell d'orchestration ne sont importés par aucun TS ; ils sont des racines en soi. |
| `apps/api` | `**/*.module.ts`, `**/*.controller.ts` | **NestJS** instancie modules et contrôleurs par **injection de dépendances et décorateurs**, pas par `import` direct depuis un `main`. Sans ces entrées, knip déclarerait morte la quasi-totalité du backend. |
| `apps/web` | *(aucune — `project` seul)* | Pas d'entrées explicites ici : à surveiller si des faux positifs App Router apparaissent (voir *Limite connue*). |
| `packages/shared` | *(bloc vide)* | knip applique ses conventions par défaut (`src/index.ts`, `package.json#exports`). |

`ignoreDependencies: ["@prisma/client"]` sur `apps/api` : le client Prisma est
consommé via le service généré / l'injection, jamais par un `import` que knip
saurait relier — on le déclare donc légitimement ignoré.

## Lancer knip en local

Un seul script, à la racine ([`package.json`](../../package.json)) :

```bash
pnpm knip
```

Il analyse **tout le monorepo** d'un coup et sort en erreur (code ≠ 0) dès qu'il
trouve un fichier, un export ou une dépendance mort — c'est ce qui en fait un
gate exploitable en CI. Le rapport liste chaque trouvaille avec son fichier et sa
catégorie (`Unused files`, `Unused exports`, `Unused dependencies`…).

> ⚠️ Il n'y a **pas** de script `knip:fix` dans ce repo (contrairement à d'autres
> monorepos). La suppression du code mort se fait donc à la main, après lecture
> du rapport — ce qui est plus sûr, `--fix` pouvant retirer un fichier
> faussement signalé.

## En CI : un gate bloquant

knip n'est pas qu'un outil de ménage optionnel ici — il **bloque la CI**. Dans le
job `quality` de [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) :

```yaml
quality:
  name: Quality (lint + knip + boundaries)
  ...
  - name: Code mort (knip)
    run: pnpm knip
  - name: Frontières hexagonales (dependency-cruiser)
    run: pnpm depcruise
```

Deux détails de câblage :

- Le job ne tourne que si le filtre `detect-changes` voit du code changer ; et
  **`knip.json` fait partie des chemins déclencheurs** (au même titre que
  `biome.json`, `.dependency-cruiser.cjs`, `tsconfig*.json`) : modifier la config
  de knip relance le gate.
- knip vit dans le même job que **Biome** (lint) et **dependency-cruiser**
  (frontières hexagonales) : les trois sont les verrous de *qualité statique*,
  distincts des jobs de test.

## knip vs dependency-cruiser : deux angles, pas un doublon

Ils tournent côte à côte et se complètent :

| Outil | Question à laquelle il répond |
|---|---|
| **knip** | « Ce code / cette dépendance est-il **encore utilisé** ? » (accessibilité) |
| **dependency-cruiser** (`pnpm depcruise`) | « Cet import **respecte-t-il les frontières** hexagonales ? » (direction des dépendances) |

[REQ-ARCH-001](../requirements/non-functional/architecture/REQ-ARCH-001.md) les
cite ensemble comme deux angles de couverture, et note explicitement qu'aucun des
deux ne détecte un **type recopié à la main** — ce contrôle-là reste à imaginer.

## Maintenance de la dépendance

`knip` est en `devDependency` (`^6.29.0`). Il est **groupé dans Dependabot** avec
les autres outils d'outillage (`@biomejs/*`, `turbo`, `dependency-cruiser`,
`lefthook`, `typescript`) — voir
[`.github/dependabot.yml`](../../.github/dependabot.yml) et
[ADR 003](../adr/003-mises-a-jour-dependances-dependabot.md). Ses montées de
version arrivent donc en une seule PR groupée, pas isolément.

## Limite connue

`apps/web` n'a **pas** d'`entry` explicite. Or Next.js (App Router) résout par
convention de système de fichiers des fichiers (`page.tsx`, `layout.tsx`,
`route.ts`, `middleware.ts`, images OG, `sitemap.ts`…) qu'aucun `import` ne
pointe. Tant que knip reste vert c'est que ses conventions par défaut suffisent ;
si de faux positifs App Router apparaissent, la correction est d'ajouter un bloc
`entry` listant ces conventions au workspace `apps/web` (patron classique d'une
config knip pour Next.js).

## En résumé

| | Détail |
|---|---|
| Rôle | Détecter fichiers / exports / dépendances **morts** |
| Config | [`knip.json`](../../knip.json), un bloc par workspace, clé `entry` = ce qui est instancié hors imports |
| Local | `pnpm knip` (rapport + code de sortie non nul si code mort) |
| CI | Gate **bloquant** dans le job `quality`, déclenché aussi par un changement de `knip.json` |
| Fix | Manuel (pas de `knip:fix` dans ce repo) |

## Références

- [REQ-ARCH-001 — propagation du contrat partagé](../requirements/non-functional/architecture/REQ-ARCH-001.md) : `knip` cité comme angle de couverture.
- [ADR 003 — mises à jour de dépendances (Dependabot)](../adr/003-mises-a-jour-dependances-dependabot.md) : groupe d'outillage incluant knip.
- Configuration : [`knip.json`](../../knip.json).
- Job CI : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), job `quality`.
- Documentation knip : <https://knip.dev>.
