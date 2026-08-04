import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Lane **intégration** de `apps/api` — contre une vraie PostgreSQL.
 *
 * Ce qui tourne ici : les adapters `infrastructure/**` (rule 16 — « pas de mock
 * Prisma ») et les contrôleurs qui lisent ou écrivent en base. Un adapter testé
 * contre un mock de Prisma ne prouve rien de ce qui casse en vrai : contraintes
 * d'unicité, cascades, types de colonnes, transactions.
 *
 * Elle a sa propre config plutôt qu'un `--project` de la lane unit, pour deux
 * raisons concrètes :
 *   - `fileParallelism: false` — les specs partagent une base unique ; les
 *     laisser tourner en parallèle produirait des échecs dépendant de l'ordre,
 *     la catégorie de flake la plus coûteuse à diagnostiquer ;
 *   - `setupFiles` — la garde anti-purge et le client Prisma partagé ne doivent
 *     jamais être chargés par la lane unit, qui doit rester DB-free.
 *
 * Orchestration (base jetable, migrations, purge) : `scripts/test-integration.sh`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.integration.spec.ts', 'src/**/*.integration.spec.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    // `setup.ts` isole les tests *entre eux* (purge avant chacun) ; ce teardown
    // garantit qu'aucun run ne laisse la base peuplée derrière lui, y compris
    // quand la suite échoue.
    globalTeardown: ['./test/integration/global-teardown.ts'],
    fileParallelism: false,
    // Une base qui démarre, des migrations qui s'appliquent : plus lent qu'un
    // test unitaire, et le défaut de 5 s produirait des faux négatifs au premier
    // run sur une machine froide.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
})
