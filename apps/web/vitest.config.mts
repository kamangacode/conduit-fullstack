import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Lane de test de `apps/web`.
 *
 * Le périmètre est délibérément étroit (rule 16) : stores, hooks et composants
 * **porteurs de logique** (état, calculs, conditions). Les composants
 * présentationnels et les pages relèvent de Playwright — les tester ici
 * gonflerait la couverture sans rien prouver, et rendrait le chiffre
 * inexploitable pour décider où manquent réellement des tests.
 *
 * `jsdom` plutôt que `happy-dom` : Testing Library cible en priorité jsdom, et
 * une divergence d'implémentation du DOM dans l'environnement de test est
 * exactement le genre de faux positif qu'on ne veut pas avoir à débusquer.
 *
 * L'extension `.mts` évite l'avertissement de chargement de config de Vite (le
 * workspace n'est pas `"type": "module"`) — un avertissement affiché à chaque
 * exécution finit par ne plus être lu.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}', 'test/**/*.spec.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Les pages sont couvertes par Playwright (rule 16) : les compter ici
        // ferait chuter le taux pour une raison qui n'appelle aucune action.
        'src/app/**',
        'src/**/*.spec.{ts,tsx}',
        'src/**/index.ts',
      ],
      // Seuils volontairement absents tant que la surface est quasi vide :
      // on mesure d'abord, on gate ensuite (rule 21, item A5).
    },
  },
})
