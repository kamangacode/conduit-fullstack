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
      name: 'domain-owns-its-model',
      severity: 'warn',
      comment:
        'domain/ possède son modèle. `@repo/shared` est le contrat HTTP (enveloppes de réponse, ' +
        "DTOs d'entrée, CONDUIT_ERROR_STATUS) : il s'arrête à interface/. Un type du domaine n'a " +
        'pas à ressembler au fil — `createdAt` y est une Date, pas une chaîne ISO. ' +
        'Voir docs/adr/031 et docs/architecture/frontieres-hexagonales.md. ' +
        'EN warn LE TEMPS DE LA MIGRATION : 8 modules legacy la violent au 2026-08-21 (les 4 ' +
        "fichiers d'erreurs, les 3 ports de lecture, user.ts). Ce ne sont pas un précédent, et " +
        'le compteur doit descendre à 0. Bascule en error prévue une fois les 4 contextes migrés.',
      from: { path: '^src/domain/' },
      to: { path: '(^|/)packages/shared/' },
    },
    {
      name: 'application-owns-its-io',
      severity: 'warn',
      comment:
        "L'entrée et la sortie d'un use case lui appartiennent. L'enveloppe du contrat " +
        '(ArticlesResponse, articlesCount) est fabriquée par un mapper de interface/, pas par le ' +
        'use case : `articlesCount` est un nom de la spec RealWorld, pas un concept métier. ' +
        'Voir docs/adr/031 et docs/architecture/frontieres-hexagonales.md. ' +
        'EN warn LE TEMPS DE LA MIGRATION : 17 modules legacy la violent au 2026-08-21.',
      from: { path: '^src/application/' },
      to: { path: '(^|/)packages/shared/' },
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
