// Test de mutation sur le seul domaine (item C8, REQ-TEST-001).
//
// ## Pourquoi un fichier `.mjs` et pas le `.json` habituel
//
// Parce que ce fichier a besoin de commentaires, et que JSON n'en a pas. La
// première version portait ses explications dans des clés `_comment*`, ce qui
// faisait dire à Stryker « Unknown stryker config option » à chaque run — un
// avertissement permanent dans un dépôt qui sert de vitrine, pour du texte que
// l'outil ignorait de toute façon.
//
// ## Le périmètre : le domaine, et lui seul
//
// C'est un choix, pas une limite technique. Le domaine est du TypeScript pur,
// testé sans mock, et c'est la couche où un test creux coûte le plus cher : une
// règle métier que rien ne tient se découvre en production. Les couches
// `application` / `infrastructure` / `interface` sont testées à doublures ou
// contre une vraie base ; y muter du code produirait surtout des survivants dus
// au harnais, c'est-à-dire du bruit. Les ports sont des interfaces : rien à muter.
//
// ## Ce que la mutation mesure, que la couverture de lignes ne dit pas
//
// La rule 16 porte une convention anti-tautologie — « supprime mentalement le
// guard testé ; si le test passe encore, il est tautologique » — et précise
// elle-même que c'est **une convention de revue, pas un gate exécutable**. La
// mutation est l'outil qui l'exécute : elle supprime la ligne à notre place, 138
// fois, et compte les fois où aucun test ne s'en aperçoit.

export default {
  packageManager: 'pnpm',

  // Déclaration explicite, et non découverte automatique : Stryker cherche ses
  // plugins en parcourant `node_modules/@stryker-mutator/*`, arbre que pnpm
  // n'aplatit pas. Sans cette ligne il démarre, n'en charge aucun, et échoue sur
  // « Cannot find TestRunner plugin vitest » **après** avoir instrumenté le code
  // — un échec tardif qui ressemble à une incompatibilité de version alors que
  // c'est une question de résolution de modules.
  plugins: ['@stryker-mutator/vitest-runner'],

  testRunner: 'vitest',
  // `.mts`, pas `.ts` : c'est l'extension réelle du config Vitest de ce
  // workspace, et Stryker échoue sinon sur « Cannot resolve entry module ».
  vitest: { configFile: 'vitest.config.mts' },

  mutate: ['src/domain/**/*.ts', '!src/domain/**/*.spec.ts', '!src/domain/**/ports/*.ts'],

  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  coverageAnalysis: 'perTest',

  // `break: 65` est un plancher de NON-RÉGRESSION, mesuré et non deviné — et
  // surtout mesuré **deux fois**. Le premier run donne 73.19 %, les suivants
  // 71.74 % sur un code identique : environ 1,5 point de variance, dû aux
  // mutants qui tombent en *timeout* plutôt qu'en *tué* (six sur `slug.ts` au
  // premier run), et un timeout dépend de la charge de la machine, pas du code.
  //
  // Un plancher posé à 70 sur la seule première mesure aurait laissé 1,74 point
  // de marge et serait passé au rouge sans qu'aucun test ne change — le genre de
  // gate qu'on désactive au troisième faux positif. La marge est donc prise sur
  // l'amplitude observée, pas sur un chiffre rond.
  //
  // `high` / `low` ne colorent que le rapport ; seul `break` fait échouer. À
  // relever quand les survivants nommés dans REQ-TEST-001 auront été traités :
  // un plancher qu'on ne remonte jamais devient un plafond.
  thresholds: { high: 90, low: 80, break: 65 },

  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
}
