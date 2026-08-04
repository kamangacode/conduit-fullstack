import { defineConfig } from 'vitest/config'

/**
 * Lane de test de `packages/shared`.
 *
 * C'est le workspace où la couverture compte le plus : ce paquet est la source
 * de vérité unique du modèle Conduit, consommée par `apps/api` **et**
 * `apps/web`. Une règle de validation fausse ici se propage des deux côtés à la
 * fois, et aucun test d'API ou d'UI ne la contredira — ils héritent du même
 * schéma.
 *
 * Les fichiers de types purs sont exclus du calcul : ils ne produisent aucune
 * ligne à l'exécution, les compter reviendrait à diluer le taux avec du vide.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/index.ts', 'src/**/*.d.ts'],
      // Seuils à poser une fois la surface stabilisée (rule 21, item A5).
    },
  },
})
