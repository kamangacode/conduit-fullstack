/**
 * dependency-cruiser — garde-fou des frontières hexagonales de apps/api.
 *
 * L'architecture hexagonale n'est une garantie que si elle est vérifiée. Ce
 * fichier transforme la règle de dépendance (les dépendances pointent toujours
 * vers l'intérieur ; le domaine ne connaît rien de l'extérieur) en contrôle
 * exécutable, lancé en pre-push et en CI plutôt qu'en revue humaine seule.
 *
 * Voir .claude/rules/12-backend-hexagonal.md et docs/adr/001.
 *
 * Lancement : `pnpm depcruise`. Le script se place dans apps/api avant de
 * cruiser `src`, pour que la résolution du tsconfig (extends, include) parte du
 * bon répertoire — les chemins rapportés sont donc relatifs à apps/api (`src/…`).
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Une dépendance circulaire signale un découpage de responsabilités bancal. À casser en extrayant une abstraction.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment:
        'domain/ est du TypeScript pur : il ne dépend ni des couches externes (application/infrastructure/interface) ni des frameworks techniques (NestJS, Prisma, RxJS, Express). Un port vit dans domain/, son adapter dans infrastructure/.',
      from: { path: '^src/domain/' },
      to: {
        path: [
          '^src/(application|infrastructure|interface)/',
          '/node_modules/(@nestjs|@prisma|prisma|rxjs|express)/',
        ],
      },
    },
    {
      name: 'application-no-interface',
      severity: 'error',
      comment:
        "application/ (use cases) définit son propre input et ne dépend jamais de interface/ (controllers). L'input du use case est owned par le use case, pas par le controller.",
      from: { path: '^src/application/' },
      to: { path: '^src/interface/' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Un module sans importeur ni entrée est probablement du code mort ou un oubli de câblage.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(spec|test)\\.ts$',
          '\\.d\\.ts$',
          '(^|/)main\\.ts$',
          '(^|/).+\\.module\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // Suit aussi les imports de type (import type { … }) : un type Prisma importé
    // dans le domaine est une fuite, même s'il disparaît à la compilation.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
}
