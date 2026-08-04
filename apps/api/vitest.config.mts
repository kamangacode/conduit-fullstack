import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Lane **unit** de `apps/api` — rapide et sans base de données.
 *
 * La séparation des lanes est le point structurant du harness (rule 16) : les
 * tests qui n'ont besoin de rien tournent en quelques secondes à chaque commit,
 * ceux qui exigent une vraie PostgreSQL vivent dans leur propre lane et sont
 * lancés explicitement. Mélanger les deux revient à payer le coût du plus lent
 * à chaque exécution du plus rapide — c'est ainsi qu'une suite de tests devient
 * une suite qu'on ne lance plus.
 *
 * Ce qui tourne ici, par couche :
 *   - `domain/**`      : TypeScript pur, zéro mock ;
 *   - `application/**` : use-cases avec ports mockés via leur interface ;
 *   - `interface/**`   : contrôleurs via `Test.createTestingModule` + supertest,
 *     tant qu'ils ne touchent pas la base ;
 *   - `app-module.boot.spec.ts` : le graphe DI doit `.compile()` sans base.
 *
 * **Métadonnée de décorateurs** : l'injection par type de NestJS repose sur
 * `emitDecoratorMetadata` (rule 12). Le transformeur de Vitest lit le tsconfig
 * du workspace et émet cette métadonnée — aucun plugin supplémentaire n'est
 * nécessaire, ce qui a été vérifié plutôt que supposé. Comme cette propriété
 * dépend du transformeur et non du code, elle peut disparaître à une montée de
 * version sans que rien d'autre ne bouge : `test/decorator-metadata.spec.ts`
 * la surveille explicitement.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Les specs d'intégration portent leur propre suffixe et leur propre
    // config : les exclure ici est ce qui garantit que `pnpm test` reste
    // DB-free, y compris quand quelqu'un en ajoute une sans y penser.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // Exclusions alignées sur « Quoi NE PAS tester » (rule 16) : y laisser des
      // fichiers sans logique dilue le taux et fait perdre son sens au chiffre.
      exclude: [
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/*.config.ts',
        'src/**/index.ts',
        'src/**/*.spec.ts',
      ],
      // Pas de seuil bloquant pour l'instant : un seuil posé au jour 1, sur un
      // module quasi vide, ne mesure rien et sera contourné au premier commit
      // gênant. On mesure d'abord, on gate ensuite (rule 21, item A5).
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
})
