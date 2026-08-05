/**
 * Configuration Playwright de la suite de conformité e2e (ADR 018).
 *
 * Ce fichier est **le nôtre** ; la suite qu'il exécute ne l'est pas. C'est toute
 * la frontière que l'arborescence rend lisible : `conformance/e2e/` est une copie
 * verbatim de l'amont qui ne s'édite jamais, et l'amont documente lui-même son
 * point d'extension — `playwright.base.ts` est une base à étendre en fournissant
 * l'URL de l'implémentation.
 *
 * On n'étend donc que ce que l'amont invite à étendre, et rien de plus : ni
 * `timeout`, ni `retries`, ni `expect.timeout`. Les relever ferait passer des
 * tests que le contrat déclare en échec, ce qui est la même triche que retoucher
 * une assertion — en moins visible, puisqu'elle tiendrait en un chiffre.
 */
import { defineConfig } from '@playwright/test'
import { baseConfig } from './conformance/e2e/playwright.base'

/**
 * Port du front sous test. Distinct du 3000 de `pnpm dev` à dessein : la suite
 * doit pouvoir tourner pendant qu'une session de développement occupe le port
 * habituel, et surtout ne jamais s'exécuter par accident contre l'application de
 * développement — qui parle, elle, à la base de dev.
 */
const webPort = process.env.E2E_WEB_PORT ?? '3100'

export default defineConfig({
  ...baseConfig,

  // La base amont pointe `./e2e`, relatif au fichier de config — donc
  // `apps/web/e2e`, qui n'existe pas ici. La copie vendorée vit sous
  // `conformance/`, à côté de son document de provenance.
  testDir: './conformance/e2e',

  use: {
    ...baseConfig.use,
    baseURL: `http://localhost:${webPort}`,
  },

  // `list` pour que l'échec soit lisible dans les logs d'un job de CI sans
  // télécharger d'artefact, `html` pour le diagnostic détaillé (traces,
  // captures). `open: 'never'` parce qu'un rapport qui ouvre un navigateur au
  // milieu d'un run non interactif est un run qui ne se termine pas.
  reporter: [['list'], ['html', { open: 'never' }]],

  // Pas de `webServer` ici, contrairement à l'exemple amont : un parcours e2e
  // traverse le navigateur, le front, l'API **et** la base. Playwright ne sait
  // démarrer que le premier de ces processus, et lui confier le front seul
  // laisserait les deux autres à la charge de l'appelant — donc la composition à
  // moitié dans ce fichier et à moitié dans un script.
  //
  // `scripts/test-e2e.sh` orchestre les trois d'un seul endroit, comme
  // `test-conformance.sh` le fait pour l'API.
})
