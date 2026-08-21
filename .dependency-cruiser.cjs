/**
 * dependency-cruiser — garde-fou des frontières hexagonales de apps/api.
 *
 * L'architecture hexagonale n'est une garantie que si elle est vérifiée. Ce
 * fichier transforme la règle de dépendance (les dépendances pointent toujours
 * vers l'intérieur ; le domaine ne connaît rien de l'extérieur) en contrôle
 * exécutable, lancé en pre-push et en CI plutôt qu'en revue humaine seule.
 *
 * Règle de placement, quatre couches et critère de placement d'un port :
 * docs/architecture/frontieres-hexagonales.md. Décisions : docs/adr/001 (topologie)
 * et docs/adr/031 (portée du contrat partagé).
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
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        "Un import que le resolver ne sait pas suivre n'est pas seulement un import cassé : il " +
        'rend les autres règles AVEUGLES sur lui. Le cas mesuré le 2026-08-21 : sans ' +
        '`packages/shared/dist`, `@repo/shared` ne se résout pas, donc ' +
        '`shared-stays-at-the-http-boundary` ne voit plus rien et depcruise sort vert avec un ' +
        'import interdit dans domain/. Un clone frais est exactement dans cet état, et le ' +
        'pre-push lance depcruise AVANT typecheck. Sans cette règle, le garde-fou de frontière ' +
        "est vert pour la mauvaise raison — la panne même que l'ADR 031 corrige ailleurs.",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'shared-stays-at-the-http-boundary',
      severity: 'error',
      comment:
        "`@repo/shared` est le contrat HTTP : enveloppes de réponse, DTOs d'entrée, messages, " +
        'CONDUIT_ERROR_STATUS. Seul interface/ le consomme. domain/ possède son modèle (un type ' +
        "du domaine n'a pas à ressembler au fil : `createdAt` y est une Date, pas une chaîne " +
        "ISO), application/ possède l'entrée et la sortie de ses use cases (`articlesCount` est " +
        'un nom de la spec RealWorld, pas un concept métier), et infrastructure/ ne connaît pas ' +
        'la forme du fil. Voir docs/adr/031 et docs/architecture/frontieres-hexagonales.md. ' +
        'Cette règle a remplacé le 2026-08-21 les deux compteurs de migration ' +
        'domain-owns-its-model (8 modules) et application-owns-its-io (18), tous deux tombés à 0.',
      from: { path: '^src/(domain|application|infrastructure)/' },
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
